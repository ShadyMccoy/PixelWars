// Sidebar form for spinning up an ad-hoc map. Reads width / height /
// growth / maxArmy / wrap / numPlayers from inputs and asks the app to
// build a Game with that config plus N ring-positioned bots. Transient
// only — nothing is persisted; clicking Apply replaces the active match.

export class MapEditor {
  constructor({ app }) {
    this.app = app;
    this.width = document.getElementById("me-width");
    this.height = document.getElementById("me-height");
    this.growth = document.getElementById("me-growth");
    this.maxArmy = document.getElementById("me-max-army");
    this.players = document.getElementById("me-players");
    this.wrap = document.getElementById("me-wrap");
    this.apply = document.getElementById("btn-me-apply");

    this.apply.addEventListener("click", () => this.submit());
  }

  submit() {
    const cfg = {
      width: clampInt(this.width.value, 6, 120, 30),
      height: clampInt(this.height.value, 6, 120, 22),
      growth: clampFloat(this.growth.value, 0.1, 5, 1.8),
      maxArmy: clampInt(this.maxArmy.value, 1, 20, 6),
      numPlayers: clampInt(this.players.value, 2, 8, 4),
      wrap: !!this.wrap.checked,
    };
    this.app._userChoseMode = true;
    this.app.loadCustomMap(cfg);
  }
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
