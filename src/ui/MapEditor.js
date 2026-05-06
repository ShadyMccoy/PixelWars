// Sidebar form for spinning up a match. Reads width / height / growth /
// maxArmy / wrap / numPlayers from inputs and asks the app to build a
// Game with that config plus N ring-positioned bots.
//
// Map presets (arena, classic, lab1, ...) are rendered as quick-fill
// buttons that populate the form fields and submit. They share the
// preset registry with the headless tournament runner so a preset
// always means the same configuration in both contexts.

import { MAPS } from "../../tournament/maps.js";

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
    this.presets = document.getElementById("me-presets");

    this.apply.addEventListener("click", () => this.submit());
    this.renderPresets();
  }

  renderPresets() {
    if (!this.presets) return;
    this.presets.innerHTML = "";
    for (const [key, preset] of Object.entries(MAPS)) {
      const btn = document.createElement("button");
      btn.className = "preset-tab";
      btn.textContent = key;
      const c = preset.config;
      btn.title = `${c.width}×${c.height} · g=${c.growth} · maxArmy=${c.maxArmy}${c.wrap ? " · wrap" : ""}`;
      btn.addEventListener("click", () => this.applyPreset(preset.config));
      this.presets.appendChild(btn);
    }
  }

  applyPreset(config) {
    this.width.value = config.width;
    this.height.value = config.height;
    this.growth.value = config.growth;
    this.maxArmy.value = config.maxArmy;
    this.wrap.checked = !!config.wrap;
    // numPlayers stays — the preset only owns the map shape, not the
    // roster size. Submit immediately so the user sees the new map.
    this.submit();
  }

  read() {
    return {
      width: clampInt(this.width.value, 6, 120, 30),
      height: clampInt(this.height.value, 6, 120, 22),
      growth: clampFloat(this.growth.value, 0.1, 5, 1.8),
      maxArmy: clampInt(this.maxArmy.value, 1, 20, 6),
      numPlayers: clampInt(this.players.value, 2, 8, 4),
      wrap: !!this.wrap.checked,
    };
  }

  submit() {
    this.app._userChoseMode = true;
    this.app.loadCustomMap(this.read());
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
