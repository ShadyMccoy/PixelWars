// Sidebar widget that lists saved matches: ones served from
// tournament/interesting.json (the headless-tournament picks) merged with
// browser-saved entries kept in localStorage. Click → app.loadReplay(entry).
//
// Browser-saved entries carry string ids (`local-<n>`) so they don't
// collide with the integer ids the headless tournament writes. They can
// be deleted from the UI; server-side entries are read-only here.

const STORE_URL = "tournament/interesting.json";
const LS_KEY = "pixelwars.savedMatches.v1";

export class MatchPicker {
  constructor({ root, refreshButton, app }) {
    this.root = root;
    this.app = app;
    this.serverEntries = [];
    this.localEntries = [];
    this.activeId = null;

    refreshButton?.addEventListener("click", () => this.load());
    this.localEntries = this._readLocal();
    this.load();
  }

  async load() {
    this.root.innerHTML = `<div class="hud-empty">Loading…</div>`;
    try {
      const res = await fetch(`${STORE_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      this.serverEntries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    } catch (e) {
      this.serverEntries = [];
    }
    this.localEntries = this._readLocal();
    this.render();
  }

  setActive(id) {
    this.activeId = id;
    for (const row of this.root.querySelectorAll(".match-row")) {
      row.classList.toggle("active", String(row.dataset.id) === String(id));
    }
  }

  // Persist a snapshot from `app.currentMatch` to localStorage. Returns
  // the stamped entry (with id + savedAt) so the caller can confirm.
  saveLocal(matchInfo) {
    if (!matchInfo) return null;
    const local = this._readLocal();
    const key = entryKey(matchInfo);
    const dup = local.find((e) => entryKey(e) === key);
    if (dup) {
      this.render();
      return dup;
    }
    const nextN = local.reduce((m, e) => {
      const match = /^local-(\d+)$/.exec(String(e.id ?? ""));
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0) + 1;
    const entry = {
      id: `local-${nextN}`,
      savedAt: new Date().toISOString(),
      map: matchInfo.map ?? "custom",
      mapConfig: matchInfo.mapConfig,
      seed: matchInfo.seed,
      lineup: matchInfo.lineup,
      lineupTech: matchInfo.lineupTech ?? null,
      startPositions: matchInfo.startPositions,
      ticks: 0,
      flags: [{ tag: "saved", note: "Saved from browser" }],
    };
    local.push(entry);
    this._writeLocal(local);
    this.localEntries = local;
    this.render();
    return entry;
  }

  deleteLocal(id) {
    const next = this._readLocal().filter((e) => String(e.id) !== String(id));
    this._writeLocal(next);
    this.localEntries = next;
    if (String(this.activeId) === String(id)) this.activeId = null;
    this.render();
  }

  _readLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  }

  _writeLocal(entries) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ entries }));
    } catch {
      // localStorage may be disabled or full; surface via the event log.
      this.app.controls?.log("⚠ Could not persist saved match (localStorage unavailable).");
    }
  }

  render() {
    const all = [...this.serverEntries, ...this.localEntries];
    if (all.length === 0) {
      this.root.innerHTML = `<div class="hud-empty">No saved matches yet.<br/><span style="font-size:10px">Press <code>S</code> or click ★ Save to keep one.</span></div>`;
      return;
    }
    // Newest-first, with local saves bubbling on top by `savedAt`.
    const sorted = all.slice().sort((a, b) => {
      const ta = a.savedAt ? Date.parse(a.savedAt) : 0;
      const tb = b.savedAt ? Date.parse(b.savedAt) : 0;
      if (ta !== tb) return tb - ta;
      const ia = typeof a.id === "number" ? a.id : 0;
      const ib = typeof b.id === "number" ? b.id : 0;
      return ib - ia;
    });
    this.root.innerHTML = "";
    for (const entry of sorted) {
      this.root.appendChild(this._renderRow(entry));
    }
  }

  _renderRow(entry) {
    const row = document.createElement("div");
    row.className = "match-row";
    row.dataset.id = entry.id;
    if (String(entry.id) === String(this.activeId)) row.classList.add("active");
    const isLocal = typeof entry.id === "string" && entry.id.startsWith("local-");
    if (isLocal) row.classList.add("local");

    const head = document.createElement("div");
    head.className = "match-row-head";
    const idEl = document.createElement("span");
    idEl.className = "match-id";
    idEl.textContent = isLocal ? `★${entry.id.replace("local-", "#")}` : `#${entry.id}`;
    head.appendChild(idEl);
    const meta = document.createElement("span");
    const ticks = entry.ticks ?? 0;
    meta.textContent = `${entry.map}·${entry.lineup.length}p${ticks ? `·t=${ticks}` : ""}·seed=${entry.seed}`;
    head.appendChild(meta);
    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    head.appendChild(spacer);
    for (const f of entry.flags || []) {
      const tag = document.createElement("span");
      tag.className = "match-flag";
      tag.dataset.tag = f.tag;
      tag.textContent = f.tag;
      tag.title = f.note ?? f.tag;
      head.appendChild(tag);
    }
    if (isLocal) {
      const del = document.createElement("button");
      del.className = "match-delete";
      del.textContent = "✕";
      del.title = "Delete saved match";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteLocal(entry.id);
      });
      head.appendChild(del);
    }

    const lineup = document.createElement("div");
    lineup.className = "match-lineup";
    lineup.textContent = entry.lineup.join(" · ");
    lineup.title = entry.lineup.join(", ");

    row.appendChild(head);
    row.appendChild(lineup);
    row.addEventListener("click", () => {
      try {
        this.app._userChoseMode = true;
        this.setActive(entry.id);
        this.app.loadReplay(entry);
      } catch (e) {
        this.app.controls?.log(`⚠ Replay ${entry.id} failed: ${e.message}`);
        console.error(e);
      }
    });
    return row;
  }
}

// Match identity: same map+seed+lineup → dup. Mirrors the headless
// `tournament/store.js` definition so server and browser saves stay
// aligned on what counts as "the same match".
function entryKey(e) {
  return `${e.map ?? "custom"}|${e.seed}|${(e.lineup || []).join(",")}`;
}
