// Sidebar widget that fetches tournament/seasons.json and presents the
// latest season's flat ratings as a tiered view. The engine no longer
// stores tiers — it produces a flat ranking by Glicko rating, and this
// viewer bins by quantile at render time. Click "Watch random match"
// to play a deterministic K-of-tier sample using the season's map.

const STORE_URL = "tournament/seasons.json";
const TIER_SIZE = 10;

export class SeasonViewer {
  constructor({ root, refreshButton, app }) {
    this.root = root;
    this.app = app;
    this.season = null;
    this.activeTier = 0;
    this.seedCounter = (Date.now() & 0x7fffffff) + 1;
    refreshButton?.addEventListener("click", () => this.load());
    this.load();
  }

  // Bin the season's full rating list (highest first) into chunks of
  // TIER_SIZE. The engine never stores tiers; this is purely a
  // presentation step.
  tieredView() {
    if (!this.season?.ratings?.length) return [];
    const sorted = this.season.ratings.slice().sort((a, b) => b.rating - a.rating);
    const tiers = [];
    for (let i = 0; i < sorted.length; i += TIER_SIZE) {
      tiers.push(sorted.slice(i, i + TIER_SIZE));
    }
    return tiers;
  }

  async load() {
    this.root.innerHTML = `<div class="hud-empty">Loading…</div>`;
    try {
      const res = await fetch(`${STORE_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      const seasons = Array.isArray(parsed?.seasons) ? parsed.seasons : [];
      this.season = seasons[seasons.length - 1] ?? null;
    } catch {
      this.root.innerHTML = `<div class="hud-empty">No saved seasons.<br/><span style="font-size:10px">Run: <code>node tournament/run.js --season</code></span></div>`;
      return;
    }
    this.render();
  }

  render() {
    if (!this.season) {
      this.root.innerHTML = `<div class="hud-empty">No saved seasons yet.</div>`;
      return;
    }
    const tiers = this.tieredView();
    if (tiers.length === 0) {
      this.root.innerHTML = `<div class="hud-empty">Season has no ratings yet.</div>`;
      return;
    }

    if (this.activeTier >= tiers.length) this.activeTier = 0;

    this.root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "league-card";

    const head = document.createElement("div");
    head.className = "league-head";
    head.innerHTML = `
      <span class="league-map">${escapeHtml(this.season.map)}</span>
      <span class="league-meta">season #${this.season.id} · ${this.season.ratings.length} bots · ${tiers.length} tier${tiers.length === 1 ? "" : "s"}</span>
    `;
    wrap.appendChild(head);

    if (Array.isArray(this.season.champions) && this.season.champions.length) {
      const champ = document.createElement("div");
      champ.className = "season-champions";
      champ.innerHTML = this.season.champions
        .map((c) => `<div><span class="champ-kind">${escapeHtml(c.kind)}</span> ${escapeHtml(c.name)}</div>`)
        .join("");
      wrap.appendChild(champ);
    }

    const tabs = document.createElement("div");
    tabs.className = "tier-tabs";
    for (let t = 0; t < tiers.length; t++) {
      const btn = document.createElement("button");
      btn.className = "tier-tab" + (t === this.activeTier ? " active" : "");
      btn.textContent = `T${t + 1}`;
      btn.title = `Tier ${t + 1}: ${tiers[t].slice(0, 3).map((b) => b.name).join(", ")}${tiers[t].length > 3 ? "…" : ""}`;
      btn.addEventListener("click", () => {
        this.activeTier = t;
        this.render();
      });
      tabs.appendChild(btn);
    }
    wrap.appendChild(tabs);

    const tier = tiers[this.activeTier];
    const list = document.createElement("ol");
    list.className = "tier-list";
    list.start = this.activeTier * TIER_SIZE + 1;
    for (const bot of tier) {
      const li = document.createElement("li");
      const rating = bot.rating != null ? bot.rating.toFixed(0) : "–";
      li.innerHTML = `<span>${escapeHtml(bot.name)}</span> <span class="rating-pill">${rating}</span>`;
      list.appendChild(li);
    }
    wrap.appendChild(list);

    if (tier.length >= 2 && this.season.mapConfig) {
      const btn = document.createElement("button");
      btn.className = "btn btn-watch";
      btn.textContent = `▶ Watch random match`;
      btn.addEventListener("click", () => {
        if (this.app) this.app._userChoseMode = true;
        const seed = ++this.seedCounter;
        const tierBots = tier.map((b) => b.name);
        this.app?.loadLeagueMatch?.({
          leagueMap: this.season.map,
          mapConfig: this.season.mapConfig,
          tierIndex: this.activeTier,
          tierBots,
          poolSize: this.season.poolSize,
          seed,
        });
      });
      wrap.appendChild(btn);
    }

    this.root.appendChild(wrap);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
