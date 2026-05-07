// In-memory registry of bots the user has pasted in this session.
//
// Persistence is intentionally session-scoped (no localStorage): the
// trust model for paste-and-run is "the user is running their own
// code in their own browser", and the friction of re-pasting is a
// reasonable forcing function until the roadmap's iframe sandbox
// lands. Survives Reset, lost on refresh.

export class CustomBots {
  constructor() {
    this.entries = new Map();
    this._listeners = new Set();
  }

  add({ name, code, strategy }) {
    if (!name) throw new Error("Custom bot needs a name");
    if (!strategy || typeof strategy.act !== "function") {
      throw new Error("Custom bot must export { act } as default");
    }
    strategy.name = name;
    strategy.author = strategy.author ?? "you";
    this.entries.set(name, { name, code, strategy });
    this._emit();
    return strategy;
  }

  remove(name) {
    if (!this.entries.delete(name)) return false;
    this._emit();
    return true;
  }

  has(name) {
    return this.entries.has(name);
  }

  getStrategy(name) {
    return this.entries.get(name)?.strategy ?? null;
  }

  getCode(name) {
    return this.entries.get(name)?.code ?? null;
  }

  list() {
    return [...this.entries.values()];
  }

  // Returns the wire payload the engine worker needs to recreate the
  // bot inside the simulation worker (eval via Blob URL + import()).
  // Only includes bots that are referenced in `usedNames` so we don't
  // ship every paste across the boundary.
  serializeUsed(usedNames) {
    const out = [];
    for (const name of usedNames) {
      const e = this.entries.get(name);
      if (e) out.push({ name: e.name, code: e.code });
    }
    return out;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) {
      try { fn(); } catch {}
    }
  }
}

// Loads pasted source as an ES module via a Blob URL and returns its
// default export. Runs on the main thread, used to validate the
// shape before we ship the code into the engine worker — that way
// errors surface in the modal, not as a worker crash.
export async function loadStrategyFromCode(code) {
  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    const def = mod.default;
    if (!def || typeof def !== "object") {
      throw new Error("Module must `export default` a strategy object.");
    }
    if (typeof def.act !== "function") {
      throw new Error("Strategy default export must have an `act(army, game)` function.");
    }
    return def;
  } finally {
    URL.revokeObjectURL(url);
  }
}
