// Sidebar widget that fetches tournament/leagues.json and lets the user
// pick a tier from a saved league to watch live in the browser.
//
// Click "Watch top tier" → app.loadLeagueMatch picks K bots from the
// tier and runs a deterministic match using the league's map config.
// Each click bumps the seed so successive watches show different
// matchups within the same tier.

const STORE_URL = "tournament/leagues.json";

export class LeagueViewer {
  constructor({ root, refreshButton, app, onFirstLoad }) {
    this.root = root;
    this.app = app;
    this.leagues = [];
    this.expandedTiers = new Map(); // map -> tier index currently shown
    this.seedCounter = Date.now() & 0x7fffffff;
    this._onFirstLoad = onFirstLoad;
    this._firstLoadDone = false;

    refreshButton?.addEventListener("click", () => this.load());
    this.load();
  }

  // Returns args suitable for app.loadLeagueMatch with the top tier of
  // the first saved league, or null if nothing is saved yet.
  topTierArgs(seed) {
    const league = this.leagues[0];
    if (!league || !league.tiers?.length) return null;
    return {
      leagueMap: league.map,
      mapConfig: league.mapConfig,
      tierIndex: 0,
      tierBots: league.tiers[0].slice(),
      poolSize: league.poolSize,
      seed: seed ?? ++this.seedCounter,
    };
  }

  async load() {
    this.root.innerHTML = `<div class="hud-empty">Loading…</div>`;
    try {
      const res = await fetch(`${STORE_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      this.leagues = Array.isArray(parsed?.leagues) ? parsed.leagues : [];
    } catch (e) {
      this.root.innerHTML = `<div class="hud-empty">No saved leagues.<br/><span style="font-size:10px">Run: <code>node tournament/run.js --league</code></span></div>`;
      this._notifyFirstLoad();
      return;
    }
    this.render();
    this._notifyFirstLoad();
  }

  _notifyFirstLoad() {
    if (this._firstLoadDone) return;
    this._firstLoadDone = true;
    this._onFirstLoad?.(this.leagues);
  }

  render() {
    if (this.leagues.length === 0) {
      this.root.innerHTML = `<div class="hud-empty">No saved leagues yet.</div>`;
      return;
    }
    this.root.innerHTML = "";
    for (const league of this.leagues) {
      this.root.appendChild(this.renderLeague(league));
    }
  }

  renderLeague(league) {
    const wrap = document.createElement("div");
    wrap.className = "league-card";

    // Header — map + when it was generated
    const head = document.createElement("div");
    head.className = "league-head";
    head.innerHTML = `
      <span class="league-map">${escapeHtml(league.map)}</span>
      <span class="league-meta">${league.tiers.length} tiers · ${league.tierSize}/tier · ${league.seasons} seasons</span>
    `;
    wrap.appendChild(head);

    // Tier tabs (rendered as a row of small buttons)
    const tabs = document.createElement("div");
    tabs.className = "tier-tabs";
    const activeTier = this.expandedTiers.get(league.map) ?? 0;
    for (let t = 0; t < league.tiers.length; t++) {
      const btn = document.createElement("button");
      btn.className = "tier-tab" + (t === activeTier ? " active" : "");
      btn.textContent = `T${t + 1}`;
      btn.title = `Tier ${t + 1}: ${league.tiers[t].slice(0, 3).join(", ")}…`;
      btn.addEventListener("click", () => {
        this.expandedTiers.set(league.map, t);
        this.render();
      });
      tabs.appendChild(btn);
    }
    wrap.appendChild(tabs);

    // Selected tier — bot list
    const tier = league.tiers[activeTier];
    const list = document.createElement("ol");
    list.className = "tier-list";
    list.start = activeTier * league.tierSize + 1;
    for (const name of tier) {
      const li = document.createElement("li");
      li.textContent = name;
      list.appendChild(li);
    }
    wrap.appendChild(list);

    // Watch button
    const btn = document.createElement("button");
    btn.className = "btn btn-watch";
    btn.textContent = `▶ Watch random match`;
    btn.addEventListener("click", () => {
      this.app._userChoseMode = true;
      const seed = ++this.seedCounter;
      this.app.loadLeagueMatch({
        leagueMap: league.map,
        mapConfig: league.mapConfig,
        tierIndex: activeTier,
        tierBots: tier.slice(),
        poolSize: league.poolSize,
        seed,
      });
    });
    wrap.appendChild(btn);

    return wrap;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
