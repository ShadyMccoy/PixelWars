import { hexToRgba } from "../render/Renderer.js";
import { STRATEGIES } from "../strategies/index.js";

export class HUD {
  constructor({ root, game, app }) {
    this.root = root;
    this.game = game;
    this.app = app;
    this.tooltip = document.createElement("div");
    this.tooltip.className = "strat-tooltip";
    this.tooltip.style.display = "none";
    document.body.appendChild(this.tooltip);
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
    if (!strat) return;
    const title = strat.name ?? "";
    const body = strat.summary || strat.description || "";
    if (!body) return;
    this.tooltip.innerHTML = `
      <div class="strat-tooltip-title">${escapeHtml(title)}</div>
      <div class="strat-tooltip-body">${escapeHtml(body)}</div>
    `;
    this.tooltip.style.setProperty("--player-color", player.color);
    this.tooltip.style.display = "block";
    this.positionTooltip(row);
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
    this.tooltip.style.display = "none";
  }

  render() {
    this.hideTooltip();
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

      const select = document.createElement("select");
      select.className = "strat-select";
      for (const name of Object.keys(STRATEGIES)) {
        const strat = STRATEGIES[name];
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (strat.description) opt.title = strat.description;
        if (player.strategy === strat) opt.selected = true;
        select.appendChild(opt);
      }
      if (player.strategy?.description) select.title = player.strategy.description;
      select.addEventListener("change", () => {
        player.strategy = STRATEGIES[select.value];
        select.title = player.strategy?.description ?? "";
        if (this.tooltip.style.display === "block") this.showTooltip(player, row);
      });

      const bar = document.createElement("div");
      bar.className = "strength-bar";
      const fill = document.createElement("div");
      fill.className = "strength-fill";
      fill.style.background = `linear-gradient(90deg, ${player.color}, ${player.accent})`;
      bar.appendChild(fill);

      row.appendChild(head);
      row.appendChild(select);
      row.appendChild(bar);

      if (this.app.mode?.key === "sandbox") {
        const select2 = document.createElement("button");
        select2.className = "btn-mini";
        select2.textContent = this.app.activePlayer === player ? "● Active" : "Set Active";
        select2.addEventListener("click", () => {
          this.app.setActivePlayer(player);
        });
        row.appendChild(select2);
      }

      row.addEventListener("mouseenter", () => this.showTooltip(player, row));
      row.addEventListener("mouseleave", () => this.hideTooltip());

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

      if (this.app.mode?.key === "sandbox") {
        const btn = row.querySelector(".btn-mini");
        if (btn) btn.textContent = this.app.activePlayer === player ? "● Active" : "Set Active";
      }
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
