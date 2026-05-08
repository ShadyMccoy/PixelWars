// Sidebar widget that fetches tournament/rankings.json and lets the user
// pick a pool of bots to draw matches from.
//
// Design:
//   - Single global ranked list of every bot, top to bottom by rating.
//   - Click a row to toggle it. Shift-click extends a range from the
//     last clicked row; Ctrl/Cmd-click toggles a single row without
//     touching the rest (same as plain click — kept for muscle memory).
//   - Tier shortcut buttons (T1, T2, …): plain click replaces the
//     selection with that tier. Shift-click extends the selection across
//     a range of tiers (anchored on the last clicked tier). Ctrl/Cmd-
//     click toggles just that tier in/out of the current selection.
//   - "Watch random match" reads the Map sidebar fields, samples
//     numPlayers bots from the current selection, and asks the app to
//     load that match.
//   - Selection toggles update only the affected rows in place so the
//     ranking-list scroll position is preserved across clicks.
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
    this._lastTierClicked = null;
    this._lastBotIndex = null;
    this._listEl = null;
    this._tabsEl = null;
    this._sumEl = null;
    this._watchBtn = null;

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
    if (this.selection.size === 0) this.applyTier(0);
    const ratings = {};
    for (const p of parsed.players) ratings[p.name] = p.rating;
    this.app?.setRatings?.(ratings);
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

  // Modifier-aware tier handler:
  //   plain → replace selection with this tier
  //   shift → extend across [_lastTierClicked, t] tier band
  //   ctrl/meta → toggle just this tier in/out of selection
  handleTierClick(t, e) {
    const players = this.rankings?.players ?? [];
    const sliceFor = (idx) => players.slice(idx * TIER_SIZE, idx * TIER_SIZE + TIER_SIZE);
    if (e?.shiftKey && this._lastTierClicked != null) {
      const a = Math.min(this._lastTierClicked, t);
      const b = Math.max(this._lastTierClicked, t);
      const next = new Set(this.selection);
      for (let i = a; i <= b; i++) {
        for (const p of sliceFor(i)) next.add(p.name);
      }
      this.selection = next;
    } else if (e?.ctrlKey || e?.metaKey) {
      const slice = sliceFor(t);
      const allIn = slice.every((p) => this.selection.has(p.name));
      const next = new Set(this.selection);
      for (const p of slice) {
        if (allIn) next.delete(p.name);
        else next.add(p.name);
      }
      this.selection = next;
    } else {
      this.applyTier(t);
    }
    this._lastTierClicked = t;
    this._refreshSelectionUi();
  }

  // Modifier-aware row handler:
  //   plain → toggle this row only
  //   shift → set every row in [_lastBotIndex, idx] to selected
  //   ctrl/meta → toggle this row only (same as plain; explicit for parity)
  handleRowClick(idx, name, e) {
    const players = this.rankings?.players ?? [];
    if (e?.shiftKey && this._lastBotIndex != null) {
      const a = Math.min(this._lastBotIndex, idx);
      const b = Math.max(this._lastBotIndex, idx);
      const next = new Set(this.selection);
      for (let i = a; i <= b; i++) {
        if (players[i]) next.add(players[i].name);
      }
      this.selection = next;
    } else {
      if (this.selection.has(name)) this.selection.delete(name);
      else this.selection.add(name);
    }
    this._lastBotIndex = idx;
    this._refreshSelectionUi();
  }

  canWatch() {
    return !!this.rankings && this.selection.size >= 2;
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

    const tierCount = Math.ceil(r.players.length / TIER_SIZE);
    const tabs = document.createElement("div");
    tabs.className = "tier-tabs";
    tabs.title = "Click: replace · Shift-click: extend · Ctrl/⌘-click: toggle";
    for (let t = 0; t < tierCount; t++) {
      const btn = document.createElement("button");
      btn.className = "tier-tab";
      btn.dataset.tier = t;
      btn.textContent = `T${t + 1}`;
      const start = t * TIER_SIZE;
      const slice = r.players.slice(start, start + TIER_SIZE);
      btn.title = `Ranks ${start + 1}–${start + slice.length}: ${slice.slice(0, 3).map((p) => p.name).join(", ")}…`;
      btn.addEventListener("click", (e) => this.handleTierClick(t, e));
      tabs.appendChild(btn);
    }
    wrap.appendChild(tabs);
    this._tabsEl = tabs;

    const sumLine = document.createElement("div");
    sumLine.className = "league-selection-sum";
    sumLine.textContent = `${this.selection.size} selected`;
    wrap.appendChild(sumLine);
    this._sumEl = sumLine;

    const list = document.createElement("div");
    list.className = "ranking-list";
    r.players.forEach((p, i) => {
      const row = document.createElement("button");
      row.className = "ranking-row";
      row.dataset.name = p.name;
      row.dataset.idx = i;
      const selected = this.selection.has(p.name);
      if (selected) row.classList.add("selected");
      row.innerHTML = `
        <span class="rr-rank">${i + 1}</span>
        <span class="rr-mark">${selected ? "●" : "○"}</span>
        <span class="rr-name">${escapeHtml(p.name)}</span>
        <span class="rr-rating">${p.rating}</span>
      `;
      row.title = `${p.matches} matches · ${p.wins} wins · avgFinish=${p.avgFinish ?? "-"}\nClick: toggle · Shift-click: range`;
      row.addEventListener("click", (e) => this.handleRowClick(i, p.name, e));
      list.appendChild(row);
    });
    wrap.appendChild(list);
    this._listEl = list;

    const btn = document.createElement("button");
    btn.className = "btn btn-watch";
    btn.textContent = `▶ Watch random match`;
    btn.addEventListener("click", () => this.watchMatch());
    wrap.appendChild(btn);
    this._watchBtn = btn;

    this._refreshSelectionUi();
    return wrap;
  }

  // Update only the bits of UI affected by a selection change:
  //   - tier-tab active flags
  //   - selection-count line
  //   - per-row .selected class + ● / ○ glyph
  //   - watch-button enabled state
  // Crucially, we do NOT replace .ranking-list children, so its scroll
  // position (and the user's place in the list) is preserved.
  _refreshSelectionUi() {
    if (this._tabsEl && this.rankings) {
      const players = this.rankings.players;
      for (const tab of this._tabsEl.querySelectorAll(".tier-tab")) {
        const t = Number(tab.dataset.tier);
        const slice = players.slice(t * TIER_SIZE, t * TIER_SIZE + TIER_SIZE);
        const allIn = slice.length > 0 && slice.every((p) => this.selection.has(p.name));
        tab.classList.toggle("active", allIn);
      }
    }
    if (this._sumEl) {
      this._sumEl.textContent = `${this.selection.size} selected`;
    }
    if (this._listEl) {
      for (const row of this._listEl.querySelectorAll(".ranking-row")) {
        const sel = this.selection.has(row.dataset.name);
        row.classList.toggle("selected", sel);
        const mark = row.querySelector(".rr-mark");
        if (mark) mark.textContent = sel ? "●" : "○";
      }
    }
    if (this._watchBtn) {
      const enable = this.selection.size >= 2;
      this._watchBtn.disabled = !enable;
      this._watchBtn.title = enable ? "" : "Select at least 2 bots";
    }
  }

  watchMatch() {
    const cfg = this.app.mapEditor.read();
    const pool = [...this.selection];
    if (pool.length < 2) return;
    const numPlayers = Math.min(cfg.numPlayers, pool.length);
    this.app._userChoseMode = true;
    this.app.loadCustomMap({ ...cfg, numPlayers, botNames: pool });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
