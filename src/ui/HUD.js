import { hexToRgba } from "../render/Renderer.js";
import { KNOBS, NEUTRAL_TECH } from "../core/Tech.js";

export class HUD {
  constructor({ root, game, app }) {
    this.root = root;
    this.game = game;
    this.app = app;
    this.tooltip = document.createElement("div");
    this.tooltip.className = "strat-tooltip";
    this.tooltip.style.display = "none";
    document.body.appendChild(this.tooltip);
    this.pinnedPlayerId = null;
    this.pinnedRow = null;
    this.tooltip.addEventListener("mousedown", (e) => e.stopPropagation());
    document.addEventListener("mousedown", (e) => {
      if (this.pinnedPlayerId == null) return;
      if (this.tooltip.contains(e.target)) return;
      const row = e.target.closest?.(".player-row");
      if (row && Number(row.dataset.playerId) === this.pinnedPlayerId) return;
      this.unpin();
    });
    window.addEventListener("resize", () => {
      if (this.pinnedRow) this.positionTooltip(this.pinnedRow);
    });
    this.render();
    game.on("players:changed", () => this.render());
  }

  setGame(game) {
    this.game = game;
    game.on("players:changed", () => this.render());
    this.render();
  }

  showTooltip(player, row) {
    const strat = player.strategy;
    const title = strat?.name ?? player.name ?? "";
    const body = strat?.summary || strat?.description || "";
    this.tooltip.innerHTML = `
      <div class="strat-tooltip-title">${escapeHtml(title)}</div>
      ${body ? `<div class="strat-tooltip-body">${escapeHtml(body)}</div>` : ""}
      ${renderTechLoadout(player)}
    `;
    this.tooltip.style.setProperty("--player-color", player.color);
    this.tooltip.style.display = "block";
    this.positionTooltip(row);
  }

  pin(player, row) {
    this.pinnedPlayerId = player.id;
    this.pinnedRow = row;
    this.tooltip.classList.add("pinned");
    this.showTooltip(player, row);
  }

  unpin() {
    this.pinnedPlayerId = null;
    this.pinnedRow = null;
    this.tooltip.classList.remove("pinned");
    this.hideTooltip();
  }

  positionTooltip(row) {
    const rect = row.getBoundingClientRect();
    const tt = this.tooltip;
    tt.style.left = "0px";
    tt.style.top = "0px";
    const ttRect = tt.getBoundingClientRect();
    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left - ttRect.width - margin;
    if (left < margin) left = rect.right + margin;
    if (left + ttRect.width > vw - margin) left = Math.max(margin, vw - ttRect.width - margin);
    let top = rect.top;
    if (top + ttRect.height > vh - margin) top = Math.max(margin, vh - ttRect.height - margin);
    tt.style.left = `${left}px`;
    tt.style.top = `${top}px`;
  }

  hideTooltip() {
    if (this.pinnedPlayerId != null) return;
    this.tooltip.style.display = "none";
  }

  render() {
    this.unpin();
    this.root.innerHTML = "";
    if (!this.game.players.list.length) {
      this.root.innerHTML = `<div class="hud-empty">No players. Add one in Sandbox.</div>`;
      return;
    }
    for (const player of this.game.players.list) {
      const row = document.createElement("div");
      row.className = "player-row";
      row.style.setProperty("--player-color", player.color);
      row.style.setProperty("--player-bg", hexToRgba(player.color, 0.12));

      const head = document.createElement("div");
      head.className = "player-head";
      head.innerHTML = `
        <span class="player-dot" style="background:${player.color}"></span>
        <span class="player-name">${escapeHtml(player.name)}</span>
        <span class="player-stat" title="Strength">⬢ <b data-stat="strength">0</b></span>
        <span class="player-stat" title="Territory">▣ <b data-stat="territory">0</b></span>
      `;

      const stratLabel = document.createElement("div");
      stratLabel.className = "strat-label";
      stratLabel.textContent = player.strategy?.name ?? "";
      if (player.strategy?.description) stratLabel.title = player.strategy.description;

      const techChips = document.createElement("div");
      techChips.className = "tech-chips";
      techChips.innerHTML = renderTechChips(player);

      const bar = document.createElement("div");
      bar.className = "strength-bar";
      const fill = document.createElement("div");
      fill.className = "strength-fill";
      fill.style.background = `linear-gradient(90deg, ${player.color}, ${player.accent})`;
      bar.appendChild(fill);

      row.appendChild(head);
      row.appendChild(stratLabel);
      row.appendChild(techChips);
      row.appendChild(bar);

      row.addEventListener("mouseenter", () => {
        if (this.pinnedPlayerId == null) this.showTooltip(player, row);
      });
      row.addEventListener("mouseleave", () => this.hideTooltip());
      row.addEventListener("mousedown", (e) => {
        if (e.target.closest("select, button, input, a")) return;
        if (this.pinnedPlayerId === player.id) {
          this.unpin();
        } else {
          this.pin(player, row);
        }
      });

      row.dataset.playerId = player.id;
      this.root.appendChild(row);
    }
  }

  update() {
    let totalStrength = 0;
    for (const p of this.game.players.list) totalStrength += p.totals.strength;

    for (const player of this.game.players.list) {
      const row = this.root.querySelector(`[data-player-id="${player.id}"]`);
      if (!row) continue;
      row.querySelector('[data-stat="strength"]').textContent = player.totals.strength.toFixed(1);
      row.querySelector('[data-stat="territory"]').textContent = player.totals.territory;
      const fill = row.querySelector(".strength-fill");
      const pct = totalStrength > 0 ? (player.totals.strength / totalStrength) * 100 : 0;
      fill.style.width = `${pct}%`;
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const KNOB_LABELS = { move: "Move", stack: "Stack", prod: "Prod", atk: "Atk", def: "Def" };
const KNOB_SHORT = { move: "MOV", stack: "STK", prod: "PRD", atk: "ATK", def: "DEF" };

function renderTechChips(player) {
  const tech = player?.tech ?? NEUTRAL_TECH;
  return KNOBS.map((k) => {
    const v = tech[k] ?? 0;
    const baseline = NEUTRAL_TECH[k];
    const cls = v > baseline ? "up" : v < baseline ? "down" : "neutral";
    return `
      <span class="tech-chip tech-${cls}" title="${KNOB_LABELS[k]} ${v}">
        <span class="tech-chip-label">${KNOB_SHORT[k]}</span>
        <span class="tech-chip-val">${v}</span>
      </span>
    `;
  }).join("");
}

function renderTechLoadout(player) {
  const tech = player?.tech ?? NEUTRAL_TECH;
  const mults = player?.techMults;
  const rows = KNOBS.map((k) => {
    const v = tech[k] ?? 0;
    const pct = Math.max(0, Math.min(100, v));
    const baseline = NEUTRAL_TECH[k];
    const cls = v > baseline ? "up" : v < baseline ? "down" : "neutral";
    const mult = mults?.[k];
    const multStr = mult == null ? "" : (k === "move" ? `${mult.toFixed(2)}× garrison` : `${mult.toFixed(2)}×`);
    return `
      <div class="tech-row tech-${cls}">
        <span class="tech-label">${KNOB_LABELS[k]}</span>
        <span class="tech-bar"><span class="tech-bar-fill" style="width:${pct}%"></span></span>
        <span class="tech-val">${v}</span>
        <span class="tech-mult">${escapeHtml(multStr)}</span>
      </div>
    `;
  }).join("");
  return `
    <div class="tech-loadout">
      <div class="tech-loadout-head">Tech Loadout</div>
      ${rows}
    </div>
  `;
}
