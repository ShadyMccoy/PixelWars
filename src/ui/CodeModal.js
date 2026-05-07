// Single shared modal used for two flows:
//   - "View code": read-only display of an existing strategy's source.
//   - "Try a bot": paste/upload a bot script, name it, run it in a match.
//
// The modal is created lazily and reused. Only one instance is open
// at a time; opening with a different mode replaces the contents.

const SAMPLE_BOT = `// Paste a strategy module here. Must be self-contained: no imports
// (the worker can't resolve relative paths from your paste). The
// 'act' callback runs every tick on each of your armies.
//
// API quick reference:
//   army.tile.neighbors[i] -> tile in direction i (0..3) or null
//   army.attack(tile, power) -> commit 'power' strength toward 'tile'
//   army.attackPower         -> max usable strength this tick
//   army.player.id           -> your own player id
//   game.rng()               -> deterministic [0,1) random
//   game.tick                -> current tick count

export default {
  name: "MyBot",
  description: "Random walk that always pushes hard.",
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const dir = (game.rng() * 4) | 0;
    const target = tile.neighbors[dir];
    if (!target) return;
    army.attack(target, army.attackPower);
  },
};
`;

export class CodeModal {
  constructor() {
    this.root = null;
    this.onSubmit = null;
    this._build();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.root && this.root.style.display !== "none") {
        this.close();
      }
    });
  }

  _build() {
    const root = document.createElement("div");
    root.className = "code-modal-root";
    root.style.display = "none";
    root.innerHTML = `
      <div class="code-modal-backdrop"></div>
      <div class="code-modal" role="dialog" aria-modal="true">
        <div class="code-modal-head">
          <div class="code-modal-title"></div>
          <button class="code-modal-close" aria-label="Close">×</button>
        </div>
        <div class="code-modal-subtitle"></div>
        <div class="code-modal-form">
          <label class="code-modal-name-row">
            <span>Bot name</span>
            <input class="code-modal-name" type="text" placeholder="MyBot" />
          </label>
        </div>
        <textarea class="code-modal-code" spellcheck="false" wrap="off"></textarea>
        <div class="code-modal-error"></div>
        <div class="code-modal-foot">
          <div class="code-modal-foot-left">
            <label class="code-modal-upload">
              <input type="file" class="code-modal-file" accept=".js,.mjs,text/javascript" />
              <span class="btn">📂 Upload .js</span>
            </label>
          </div>
          <div class="code-modal-foot-right">
            <button class="btn code-modal-cancel">Cancel</button>
            <button class="btn primary code-modal-submit">Use in match</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    this.root = root;
    this.titleEl = root.querySelector(".code-modal-title");
    this.subtitleEl = root.querySelector(".code-modal-subtitle");
    this.formEl = root.querySelector(".code-modal-form");
    this.nameEl = root.querySelector(".code-modal-name");
    this.codeEl = root.querySelector(".code-modal-code");
    this.errEl = root.querySelector(".code-modal-error");
    this.footEl = root.querySelector(".code-modal-foot");
    this.submitEl = root.querySelector(".code-modal-submit");
    this.cancelEl = root.querySelector(".code-modal-cancel");
    this.fileEl = root.querySelector(".code-modal-file");

    root.querySelector(".code-modal-backdrop").addEventListener("click", () => this.close());
    root.querySelector(".code-modal-close").addEventListener("click", () => this.close());
    this.cancelEl.addEventListener("click", () => this.close());
    this.submitEl.addEventListener("click", () => this._submit());
    this.fileEl.addEventListener("change", (e) => this._onFile(e));
  }

  openView({ title, subtitle = "", code }) {
    this._setMode("view");
    this.titleEl.textContent = title;
    this.subtitleEl.textContent = subtitle;
    this.codeEl.value = code ?? "";
    this.codeEl.scrollTop = 0;
    this.errEl.textContent = "";
    this._show();
  }

  openEdit({ title = "Try a bot", subtitle = "Paste a strategy module. It runs in your browser only — clears on refresh.", initialCode = SAMPLE_BOT, initialName = "MyBot", onSubmit }) {
    this._setMode("edit");
    this.titleEl.textContent = title;
    this.subtitleEl.textContent = subtitle;
    this.codeEl.value = initialCode;
    this.nameEl.value = initialName;
    this.errEl.textContent = "";
    this.onSubmit = onSubmit;
    this._show();
    setTimeout(() => this.nameEl.focus(), 0);
  }

  setError(msg) {
    this.errEl.textContent = msg ?? "";
  }

  close() {
    if (!this.root) return;
    this.root.style.display = "none";
    this.onSubmit = null;
  }

  _show() {
    this.root.style.display = "block";
  }

  _setMode(mode) {
    const editing = mode === "edit";
    this.codeEl.readOnly = !editing;
    this.codeEl.classList.toggle("readonly", !editing);
    this.formEl.style.display = editing ? "" : "none";
    this.footEl.style.display = editing ? "" : "none";
    this.cancelEl.textContent = editing ? "Cancel" : "Close";
  }

  async _submit() {
    if (!this.onSubmit) return this.close();
    const name = (this.nameEl.value || "").trim();
    const code = this.codeEl.value;
    if (!name) {
      this.setError("Name is required.");
      this.nameEl.focus();
      return;
    }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      this.setError("Name must start with a letter and use only letters, digits, _.");
      this.nameEl.focus();
      return;
    }
    if (!code.trim()) {
      this.setError("Paste a strategy module.");
      this.codeEl.focus();
      return;
    }
    this.submitEl.disabled = true;
    try {
      await this.onSubmit({ name, code });
      this.close();
    } catch (err) {
      this.setError(err?.message ?? String(err));
    } finally {
      this.submitEl.disabled = false;
    }
  }

  async _onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      this.codeEl.value = text;
      if (!this.nameEl.value) {
        const guess = file.name.replace(/\.(m?js)$/i, "");
        if (/^[A-Za-z][A-Za-z0-9_]*$/.test(guess)) this.nameEl.value = guess;
      }
    } catch (err) {
      this.setError("Couldn't read file: " + err.message);
    } finally {
      e.target.value = "";
    }
  }
}
