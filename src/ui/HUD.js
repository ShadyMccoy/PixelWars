import { hexToRgba } from "../render/Renderer.js";
import { STRATEGIES } from "../strategies/index.js";

export class HUD {
  constructor({ root, game, app }) {
    this.root = root;
    this.game = game;
    this.app = app;
    this.render();
    game.on("players:changed", () => this.render());
  }

  setGame(game) {
    this.game = game;
    game.on("players:changed", () => this.render());
    this.render();
  }

  render() {
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
        <span class="player-stat">⚔ <b data-stat="armies">0</b></span>
        <span class="player-stat">⬢ <b data-stat="strength">0</b></span>
        <span class="player-stat">▣ <b data-stat="territory">0</b></span>
      `;

      const select = document.createElement("select");
      select.className = "strat-select";
      for (const name of Object.keys(STRATEGIES)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (player.strategy === STRATEGIES[name]) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        player.strategy = STRATEGIES[select.value];
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
      row.querySelector('[data-stat="armies"]').textContent = player.totals.armies;
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
