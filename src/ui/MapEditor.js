// Sidebar form for the map config used by "Watch random match". Owns
// width / height / growth / maxArmy / wrap / numPlayers inputs plus the
// preset tabs (currently just lab1). Any change re-runs the
// current scenario through `app.applyMapForm()`; the rankings panel
// supplies the bot pool.
//
// Map presets share their config with the headless tournament runner
// so a preset always means the same map shape in both contexts. Each
// preset also carries a recommended player count, which fills the
// Players field when the preset is clicked (still editable).

import { MAPS } from "../../tournament/maps.js";

const DEFAULT_PRESET_PLAYERS = 4;

export class MapEditor {
  constructor({ app }) {
    this.app = app;
    this.width = document.getElementById("me-width");
    this.height = document.getElementById("me-height");
    this.growth = document.getElementById("me-growth");
    this.maxArmy = document.getElementById("me-max-army");
    this.players = document.getElementById("me-players");
    this.wrap = document.getElementById("me-wrap");
    this.presets = document.getElementById("me-presets");

    const inputs = [this.width, this.height, this.growth, this.maxArmy, this.players, this.wrap];
    for (const el of inputs) {
      el.addEventListener("change", () => this.app.applyMapForm());
    }
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
      const k = preset.players ?? DEFAULT_PRESET_PLAYERS;
      btn.title = `${c.width}×${c.height} · g=${c.growth} · maxArmy=${c.maxArmy}${c.wrap ? " · wrap" : ""} · ${k} players`;
      btn.addEventListener("click", () => this.applyPreset(preset));
      this.presets.appendChild(btn);
    }
  }

  applyPreset(preset) {
    const c = preset.config;
    this.width.value = c.width;
    this.height.value = c.height;
    this.growth.value = c.growth;
    this.maxArmy.value = c.maxArmy;
    this.wrap.checked = !!c.wrap;
    this.players.value = preset.players ?? DEFAULT_PRESET_PLAYERS;
    this.app.applyMapForm();
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

  // Sync form fields from an external config (e.g. URL-loaded match)
  // without firing the change handlers — the caller is already doing
  // its own load and shouldn't be rebounded back into applyMapForm.
  write({ width, height, growth, maxArmy, wrap, numPlayers }) {
    if (width != null) this.width.value = width;
    if (height != null) this.height.value = height;
    if (growth != null) this.growth.value = growth;
    if (maxArmy != null) this.maxArmy.value = maxArmy;
    if (wrap != null) this.wrap.checked = !!wrap;
    if (numPlayers != null) this.players.value = numPlayers;
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
