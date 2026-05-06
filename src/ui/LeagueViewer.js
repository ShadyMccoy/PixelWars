// Sidebar widget that fetches tournament/rankings.json and lets the user
// pick a pool of bots to draw matches from.
//
// Design:
//   - Single global ranked list of every bot, top to bottom by rating.
//   - Click a row to toggle it in/out of the selection.
//   - Tier shortcut buttons (T1, T2, …) replace the selection with a
//     band of the ranking (T1 = ranks 1-10, T2 = 11-20, etc.).
//   - "Watch random match" reads the Custom Map sidebar fields, samples
//     numPlayers bots from the current selection, and asks the app to
//     load that match. Map config and player count come from the Custom
//     Map form — the rankings list only owns "which bots are in the
//     pool."
//
// If tournament/rankings.json is missing, we show a hint to run
// `npm run tournament -- --league` to generate it.

const STORE_URL = "tournament/rankings.json";
const TIER_SIZE = 10;

export class LeagueViewer {
  constructor({ root, refreshButton, app, onFirstLoad }) {
    this.root = root;
    this.app = app;
    this.rankings = null;
    this.selection = new Set();
    this._onFirstLoad = onFirstLoad;
    this._firstLoadDone = false;

    refreshButton?.addEventListener("click", () => this.load());
    this.load();
  }

  async load() {
    this.root.innerHTML = `<div class="hud-empty">Loading…</div>`;
    let parsed = null;
    try {
      const res = await fetch(`${STORE_URL}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.players) && data.players.length > 0) parsed = data;
      }
    } catch {
      // fall through
    }
    if (!parsed) {
      this.root.innerHTML = `<div class="hud-empty">No rankings yet.<br/><span style="font-size:10px">Run: <code>npm run tournament -- --league</code></span></div>`;
      this._notifyFirstLoad();
      return;
    }
    this.rankings = parsed;
    // Default selection: top tier-size bots.
    if (this.selection.size === 0) this.applyTier(0);
    this.render();
    this._notifyFirstLoad();
  }

  _notifyFirstLoad() {
    if (this._firstLoadDone) return;
    this._firstLoadDone = true;
    this._onFirstLoad?.(this.rankings);
  }

  applyTier(tierIdx) {
    const players = this.rankings?.players ?? [];
    const start = tierIdx * TIER_SIZE;
    const slice = players.slice(start, start + TIER_SIZE);
    this.selection = new Set(slice.map((p) => p.name));
  }

  toggle(name) {
    if (this.selection.has(name)) this.selection.delete(name);
    else this.selection.add(name);
    this.render();
  }

  // Suggested first match args for the auto-loader on first load. Picks
  // numPlayers random bots from the top tier — the most intuitive default.
  topTierArgs(numPlayers = 4) {
    if (!this.rankings) return null;
    const pool = this.rankings.players.slice(0, TIER_SIZE).map((p) => p.name);
    if (pool.length < numPlayers) return null;
    return { botNames: pool, numPlayers };
  }

  render() {
    if (!this.rankings) return;
    this.root.innerHTML = "";
    this.root.appendChild(this.renderCard());
  }

  renderCard() {
    const wrap = document.createElement("div");
    wrap.className = "league-card";

    const r = this.rankings;
    const head = document.createElement("div");
    head.className = "league-head";
    const fitInfo = r.converged ? `${r.matchCount} matches` : `${r.matchCount} matches · not converged`;
    head.innerHTML = `
      <span class="league-map">RANKINGS</span>
      <span class="league-meta">${r.players.length} bots · ${fitInfo}</span>
    `;
    wrap.appendChild(head);

    // Tier-band buttons: T1, T2, … each click replaces selection.
    const tierCount = Math.ceil(r.players.length / TIER_SIZE);
    const tabs = document.createElement("div");
    tabs.className = "tier-tabs";
    for (let t = 0; t < tierCount; t++) {
      const btn = document.createElement("button");
      btn.className = "tier-tab";
      btn.textContent = `T${t + 1}`;
      const start = t * TIER_SIZE;
      const slice = r.players.slice(start, start + TIER_SIZE);
      // "Active" = the current selection equals this tier exactly.
      const sliceNames = new Set(slice.map((p) => p.name));
      const matches = sliceNames.size === this.selection.size &&
        [...sliceNames].every((n) => this.selection.has(n));
      if (matches) btn.classList.add("active");
      btn.title = `Select ranks ${start + 1}–${start + slice.length}: ${slice.slice(0, 3).map((p) => p.name).join(", ")}…`;
      btn.addEventListener("click", () => {
        this.applyTier(t);
        this.render();
      });
      tabs.appendChild(btn);
    }
    wrap.appendChild(tabs);

    // Selection summary line.
    const sumLine = document.createElement("div");
    sumLine.className = "league-selection-sum";
    sumLine.textContent = `${this.selection.size} selected`;
    wrap.appendChild(sumLine);

    // Single ranked list of all bots.
    const list = document.createElement("div");
    list.className = "ranking-list";
    r.players.forEach((p, i) => {
      const row = document.createElement("button");
      row.className = "ranking-row";
      const selected = this.selection.has(p.name);
      if (selected) row.classList.add("selected");
      row.innerHTML = `
        <span class="rr-rank">${i + 1}</span>
        <span class="rr-mark">${selected ? "●" : "○"}</span>
        <span class="rr-name">${escapeHtml(p.name)}</span>
        <span class="rr-rating">${p.rating}</span>
      `;
      row.title = `${p.matches} matches · ${p.wins} wins · avgFinish=${p.avgFinish ?? "-"}`;
      row.addEventListener("click", () => this.toggle(p.name));
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // Watch button.
    const btn = document.createElement("button");
    btn.className = "btn btn-watch";
    btn.textContent = `▶ Watch random match`;
    btn.addEventListener("click", () => this.watchMatch());
    if (this.selection.size < 2) {
      btn.disabled = true;
      btn.title = "Select at least 2 bots";
    }
    wrap.appendChild(btn);

    return wrap;
  }

  watchMatch() {
    const cfg = readMapEditor();
    const pool = [...this.selection];
    if (pool.length < 2) return;
    const numPlayers = Math.min(cfg.numPlayers, pool.length);
    this.app._userChoseMode = true;
    this.app.loadCustomMap({ ...cfg, numPlayers, botNames: pool });
  }
}

function readMapEditor() {
  const w = document.getElementById("me-width");
  const h = document.getElementById("me-height");
  const g = document.getElementById("me-growth");
  const m = document.getElementById("me-max-army");
  const p = document.getElementById("me-players");
  const wr = document.getElementById("me-wrap");
  return {
    width: clampInt(w?.value, 6, 120, 30),
    height: clampInt(h?.value, 6, 120, 22),
    growth: clampFloat(g?.value, 0.1, 5, 1.8),
    maxArmy: clampInt(m?.value, 1, 20, 6),
    numPlayers: clampInt(p?.value, 2, 8, 4),
    wrap: !!wr?.checked,
  };
}

function clampInt(raw, lo, hi, fallback) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function clampFloat(raw, lo, hi, fallback) {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
