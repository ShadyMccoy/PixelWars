// Sidebar widget that fetches tournament/leagues.json and lets the user
// pick a tier from the saved rankings to watch live in the browser.
//
// Rankings (tier compositions) are rendered once, sourced from the first
// saved league. The map selector is independent: it only chooses which
// map config the watch button uses to play the match. This keeps tiers
// and map type as orthogonal user choices instead of duplicating the
// rankings panel per map.
//
// Click "Watch random match" → app.loadLeagueMatch picks K bots from the
// active tier and runs a deterministic match using the active map's
// config. Each click bumps the seed so successive watches show different
// matchups within the same (tier, map).

const STORE_URL = "tournament/leagues.json";

export class LeagueViewer {
  constructor({ root, refreshButton, app, onFirstLoad }) {
    this.root = root;
    this.app = app;
    this.leagues = [];
    this.activeMap = null;
    this.activeTier = 0;
    this.seedCounter = Date.now() & 0x7fffffff;
    this._onFirstLoad = onFirstLoad;
    this._firstLoadDone = false;

    refreshButton?.addEventListener("click", () => this.load());
    this.load();
  }

  // The canonical rankings source. Tiers shown in the UI come from here,
  // regardless of which map is selected.
  rankingsLeague() {
    return this.leagues[0] ?? null;
  }

  // The league entry whose mapConfig drives the watch match.
  activeMapLeague() {
    return this.leagues.find((l) => l.map === this.activeMap) ?? this.rankingsLeague();
  }

  // Returns args suitable for app.loadLeagueMatch with the top tier of
  // the rankings, or null if nothing is saved yet.
  topTierArgs(seed) {
    const ranking = this.rankingsLeague();
    const mapLeague = this.activeMapLeague();
    if (!ranking || !ranking.tiers?.length || !mapLeague) return null;
    return {
      leagueMap: mapLeague.map,
      mapConfig: mapLeague.mapConfig,
      tierIndex: 0,
      tierBots: ranking.tiers[0].slice(),
      poolSize: ranking.poolSize,
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
    if (this.leagues.length && !this.leagues.some((l) => l.map === this.activeMap)) {
      this.activeMap = this.leagues[0].map;
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
    const ranking = this.rankingsLeague();
    if (!ranking || !ranking.tiers?.length) {
      this.root.innerHTML = `<div class="hud-empty">League data has no tiers.</div>`;
      return;
    }
    if (this.activeTier >= ranking.tiers.length) this.activeTier = 0;

    this.root.innerHTML = "";
    this.root.appendChild(this.renderCard(ranking));
  }

  renderCard(ranking) {
    const wrap = document.createElement("div");
    wrap.className = "league-card";

    // Header — tier/season metadata for the rankings (no map name; map is
    // chosen independently below).
    const head = document.createElement("div");
    head.className = "league-head";
    head.innerHTML = `
      <span class="league-map">RANKINGS</span>
      <span class="league-meta">${ranking.tiers.length} tiers · ${ranking.tierSize}/tier · ${ranking.seasons} seasons</span>
    `;
    wrap.appendChild(head);

    // Map selector — independent of the rankings. Only shown when more
    // than one map has saved data; otherwise it'd just be a single inert
    // button.
    if (this.leagues.length > 1) {
      const mapRow = document.createElement("div");
      mapRow.className = "league-map-tabs";
      const label = document.createElement("span");
      label.className = "league-map-label";
      label.textContent = "Map";
      mapRow.appendChild(label);
      for (const league of this.leagues) {
        const btn = document.createElement("button");
        btn.className = "tier-tab" + (league.map === this.activeMap ? " active" : "");
        btn.textContent = league.map;
        btn.title = `Play matches on ${league.map}`;
        btn.addEventListener("click", () => {
          this.activeMap = league.map;
          this.render();
        });
        mapRow.appendChild(btn);
      }
      wrap.appendChild(mapRow);
    }

    // Tier tabs
    const tabs = document.createElement("div");
    tabs.className = "tier-tabs";
    for (let t = 0; t < ranking.tiers.length; t++) {
      const btn = document.createElement("button");
      btn.className = "tier-tab" + (t === this.activeTier ? " active" : "");
      btn.textContent = `T${t + 1}`;
      btn.title = `Tier ${t + 1}: ${ranking.tiers[t].slice(0, 3).join(", ")}…`;
      btn.addEventListener("click", () => {
        this.activeTier = t;
        this.render();
      });
      tabs.appendChild(btn);
    }
    wrap.appendChild(tabs);

    // Selected tier — bot list
    const tier = ranking.tiers[this.activeTier];
    const list = document.createElement("ol");
    list.className = "tier-list";
    list.start = this.activeTier * ranking.tierSize + 1;
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
      const mapLeague = this.activeMapLeague();
      if (!mapLeague) return;
      const seed = ++this.seedCounter;
      this.app.loadLeagueMatch({
        leagueMap: mapLeague.map,
        mapConfig: mapLeague.mapConfig,
        tierIndex: this.activeTier,
        tierBots: tier.slice(),
        poolSize: ranking.poolSize,
        seed,
      });
    });
    wrap.appendChild(btn);

    return wrap;
  }
}
