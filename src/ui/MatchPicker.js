// Sidebar widget that fetches tournament/interesting.json and renders a
// clickable list of saved matches. Click → app.loadReplay(entry).
//
// The JSON is the same file the headless tournament writes via
// tournament/store.js. When a future browser-side tournament runner lands,
// it will write to localStorage with the same shape and we'll add a switch
// here to merge both sources.

const STORE_URL = "tournament/interesting.json";

export class MatchPicker {
  constructor({ root, refreshButton, app }) {
    this.root = root;
    this.app = app;
    this.entries = [];
    this.activeId = null;

    refreshButton?.addEventListener("click", () => this.load());
    this.load();
  }

  async load() {
    this.root.innerHTML = `<div class="hud-empty">Loading…</div>`;
    try {
      // Cache-bust so the browser sees fresh tournament writes without a hard reload.
      const res = await fetch(`${STORE_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      this.entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    } catch (e) {
      this.root.innerHTML = `<div class="hud-empty">No saved matches.<br/><span style="font-size:10px">Run a tournament: <code>node tournament/run.js</code></span></div>`;
      return;
    }
    this.render();
  }

  setActive(id) {
    this.activeId = id;
    for (const row of this.root.querySelectorAll(".match-row")) {
      row.classList.toggle("active", String(row.dataset.id) === String(id));
    }
  }

  render() {
    if (this.entries.length === 0) {
      this.root.innerHTML = `<div class="hud-empty">No saved matches yet.</div>`;
      return;
    }
    // Newest first.
    const sorted = [...this.entries].sort((a, b) => (b.id || 0) - (a.id || 0));
    this.root.innerHTML = "";
    for (const entry of sorted) {
      const row = document.createElement("div");
      row.className = "match-row";
      row.dataset.id = entry.id;
      if (entry.id === this.activeId) row.classList.add("active");

      const head = document.createElement("div");
      head.className = "match-row-head";
      const idEl = document.createElement("span");
      idEl.className = "match-id";
      idEl.textContent = `#${entry.id}`;
      head.appendChild(idEl);
      const meta = document.createElement("span");
      meta.textContent = `${entry.map}·${entry.lineup.length}p·t=${entry.ticks}`;
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

      const lineup = document.createElement("div");
      lineup.className = "match-lineup";
      lineup.textContent = entry.lineup.join(" · ");
      lineup.title = entry.lineup.join(", ");

      row.appendChild(head);
      row.appendChild(lineup);
      row.addEventListener("click", () => {
        try {
          this.setActive(entry.id);
          this.app.loadReplay(entry);
        } catch (e) {
          // Most likely cause: the saved match references a strategy that
          // was renamed or deleted since the file was written.
          this.app.controls?.log(`⚠ Replay #${entry.id} failed: ${e.message}`);
          console.error(e);
        }
      });
      this.root.appendChild(row);
    }
  }
}
