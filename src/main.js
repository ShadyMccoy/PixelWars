import { Game } from "./core/Game.js";
import { Player } from "./core/Player.js";
import { startingBlobSide, placeStartingBlob } from "./core/startup.js";
import { Renderer } from "./render/Renderer.js";
import { StatsChart } from "./render/StatsChart.js";
import { TerritoryChart } from "./render/TerritoryChart.js";
import { HUD } from "./ui/HUD.js";
import { Controls } from "./ui/Controls.js";
import { MatchPicker } from "./ui/MatchPicker.js";
import { LeagueViewer } from "./ui/LeagueViewer.js";
import { SeasonViewer } from "./ui/SeasonViewer.js";
import { MapEditor } from "./ui/MapEditor.js";
import { ALL_STRATEGIES, STRATEGY_LIST } from "./strategies/index.js";

// Mirrors tournament/arena.js so a replayed match looks the same on screen
// as the headless run.
const REPLAY_PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
  { color: "#ffe066", accent: "#fff3a3" },
  { color: "#7cffb2", accent: "#bbffd6" },
];

class App {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.chartCanvas = document.getElementById("chart-canvas");
    this.territoryChartCanvas = document.getElementById("territory-chart-canvas");
    this.hudRoot = document.getElementById("hud-root");
    this.modeKey = "custom";
    this.mode = null;
    this.playing = true;
    this.speed = 1;
    this.lastFrame = performance.now();
    this.tickAccumulator = 0;
    this.tickInterval = 1 / 30;
    this.renderInterval = 200;
    this.lastRender = 0;
    this._needsRender = true;
    this.activePlayer = null;
    this.lastWinnerLogged = null;

    this.controls = new Controls({ app: this });
    this.replayEntry = null;
    // Auto-stop applies in any "watch one match end-to-end" context —
    // saved replays and ranking-driven matches. Stays off for ad-hoc
    // custom-map runs so users can keep watching past the first
    // elimination.
    this.autoStopOnWinner = false;
    // Tracks whether the user has already touched the controls so the
    // async rankings loader doesn't yank them out of an active view.
    this._userChoseMode = false;

    this.matchPicker = new MatchPicker({
      root: document.getElementById("match-picker"),
      refreshButton: document.getElementById("btn-matches-refresh"),
      app: this,
    });
    this.seasonViewer = new SeasonViewer({
      root: document.getElementById("season-viewer"),
      refreshButton: document.getElementById("btn-seasons-refresh"),
      app: this,
    });
    this.mapEditor = new MapEditor({ app: this });
    // Initial match: seed the canvas with default form values + top of
    // STRATEGY_LIST so something renders before rankings.json loads.
    this.loadCustomMap(this.mapEditor.read());
    // Reset the override flag so the rankings loader can replace the
    // initial canvas with a top-tier match once rankings.json arrives.
    this._userChoseMode = false;
    this.leagueViewer = new LeagueViewer({
      root: document.getElementById("league-viewer"),
      refreshButton: document.getElementById("btn-leagues-refresh"),
      app: this,
      onFirstLoad: (rankings) => {
        if (this._userChoseMode) return;
        if (!rankings) return;
        this.leagueViewer.watchMatch();
      },
    });
    this.startLoop();
  }

  // Called by MapEditor whenever a form field or preset changes. Re-runs
  // the match through the rankings flow when a selection is available;
  // falls back to the default-strategies path when rankings haven't
  // loaded (or when the selection has been emptied).
  applyMapForm() {
    this._userChoseMode = true;
    if (this.leagueViewer?.canWatch()) {
      this.leagueViewer.watchMatch();
    } else {
      this.loadCustomMap(this.mapEditor.read());
    }
  }

  loadReplay(entry) {
    // Saved entries are self-contained: mapConfig + lineup + startPositions
    // + seed are all the inputs runMatch (and Game) need. Reproducing the
    // headless result in the browser is a matter of feeding the same
    // values into a Game instance.
    const strategies = entry.lineup.map((name) => {
      const s = ALL_STRATEGIES[name];
      if (!s) throw new Error(`Replay references unknown strategy: ${name}`);
      return s;
    });

    this.replayEntry = entry;
    this.autoStopOnWinner = true;
    this.modeKey = "replay";
    this.mode = { key: "replay", name: `Replay #${entry.id}` };
    this.game = new Game({ ...entry.mapConfig, seed: entry.seed });

    const players = strategies.map((s, i) => {
      const palette = REPLAY_PALETTE[i % REPLAY_PALETTE.length];
      // Per-slot saved tech wins (legacy replays predate it; fall back
      // to the strategy's character tech, which is what runMatch sees).
      const tech = entry.lineupTech?.[i] ?? s.tech;
      return new Player({
        name: `${s.name}#${i + 1}`,
        color: palette.color,
        accent: palette.accent,
        strategy: s,
        tech,
      });
    });
    players.forEach((p) => this.game.addPlayer(p));
    {
      const side = startingBlobSide(this.game.map, entry.startPositions.length);
      entry.startPositions.forEach((pos, i) => {
        placeStartingBlob(this.game, players[i], pos.x, pos.y, side);
      });
    }

    const flagText = (entry.flags ?? []).map((f) => f.tag).join(" · ") || "saved";
    document.getElementById("mode-description").textContent =
      `Replay #${entry.id} · ${entry.map} · seed=${entry.seed} · ${flagText}`;

    if (!this.renderer) {
      this.renderer = new Renderer({ canvas: this.canvas, game: this.game });
    } else {
      this.renderer.setGame(this.game);
    }
    if (!this.chart) {
      this.chart = new StatsChart({ canvas: this.chartCanvas, game: this.game });
    } else {
      this.chart.setGame(this.game);
    }

    if (!this.territoryChart) {
      this.territoryChart = new TerritoryChart({ canvas: this.territoryChartCanvas, game: this.game });
    } else {
      this.territoryChart.setGame(this.game);
    }
    if (!this.hud) {
      this.hud = new HUD({ root: this.hudRoot, game: this.game, app: this });
    } else {
      this.hud.setGame(this.game);
    }

    this.activePlayer = this.game.players.list[0] ?? null;
    this.lastWinnerLogged = null;
    this.matchPicker?.setActive(entry.id);
    this.controls.log(`▶ Replay #${entry.id} · ${entry.lineup.join(", ")}`);
    this.bindCanvas();
    this.playing = true;
    this.controls.setPlaying(true);
    this.markDirty();
  }

  loadCustomMap({ width, height, growth, maxArmy, wrap, numPlayers, botNames = null, fixedLineup = false }) {
    // Transient ad-hoc map: build a Game with the user's config and seat
    // N bots in a ring. If `botNames` is given:
    //   - fixedLineup=true: use the names in order (Reset path).
    //   - otherwise: sample numPlayers random names from the pool.
    // No botNames → top of STRATEGY_LIST.
    let strategies;
    if (botNames) {
      const pool = botNames.map((n) => ALL_STRATEGIES[n]).filter(Boolean);
      if (fixedLineup) {
        if (pool.length < numPlayers) {
          throw new Error(`Saved lineup has ${pool.length} valid bots; need ${numPlayers}`);
        }
        strategies = pool.slice(0, numPlayers);
      } else {
        if (pool.length < numPlayers) {
          throw new Error(`Pool has ${pool.length} valid bots; need ${numPlayers}`);
        }
        strategies = [];
        const remaining = pool.slice();
        for (let i = 0; i < numPlayers; i++) {
          const j = Math.floor(Math.random() * remaining.length);
          strategies.push(remaining.splice(j, 1)[0]);
        }
      }
    } else {
      strategies = STRATEGY_LIST.slice(0, numPlayers);
      if (strategies.length < numPlayers) {
        throw new Error(`Not enough strategies for ${numPlayers} players`);
      }
    }
    const seed = (Date.now() & 0x7fffffff) >>> 0;

    this.replayEntry = null;
    this.autoStopOnWinner = false;
    this.modeKey = "custom";
    this.mode = { key: "custom", name: "Custom Map" };
    // Snapshot the chosen lineup so Reset reproduces the same matchup
    // (different seed, same bots & map config).
    this.lastCustomArgs = {
      width, height, growth, maxArmy, wrap, numPlayers,
      botNames: strategies.map((s) => s.name),
      fixedLineup: true,
    };
    this.game = new Game({ width, height, growth, maxArmy, wrap, seed });

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.4;
    const positions = [];
    for (let i = 0; i < numPlayers; i++) {
      const angle = (i / numPlayers) * Math.PI * 2;
      const x = Math.max(1, Math.min(width - 2, Math.floor(cx + Math.cos(angle) * r)));
      const y = Math.max(1, Math.min(height - 2, Math.floor(cy + Math.sin(angle) * r)));
      positions.push({ x, y });
    }

    const players = strategies.map((s, i) => {
      const palette = REPLAY_PALETTE[i % REPLAY_PALETTE.length];
      return new Player({
        name: `${s.name}#${i + 1}`,
        color: palette.color,
        accent: palette.accent,
        strategy: s,
        tech: s.tech,
      });
    });
    players.forEach((p) => this.game.addPlayer(p));
    {
      const side = startingBlobSide(this.game.map, positions.length);
      positions.forEach((pos, i) => {
        placeStartingBlob(this.game, players[i], pos.x, pos.y, side);
      });
    }

    document.getElementById("mode-description").textContent =
      `Custom · ${width}×${height} · g=${growth} · maxArmy=${maxArmy}${wrap ? " · wrap" : ""} · ${numPlayers} bots`;

    if (!this.renderer) {
      this.renderer = new Renderer({ canvas: this.canvas, game: this.game });
    } else {
      this.renderer.setGame(this.game);
    }
    if (!this.chart) {
      this.chart = new StatsChart({ canvas: this.chartCanvas, game: this.game });
    } else {
      this.chart.setGame(this.game);
    }

    if (!this.territoryChart) {
      this.territoryChart = new TerritoryChart({ canvas: this.territoryChartCanvas, game: this.game });
    } else {
      this.territoryChart.setGame(this.game);
    }
    if (!this.hud) {
      this.hud = new HUD({ root: this.hudRoot, game: this.game, app: this });
    } else {
      this.hud.setGame(this.game);
    }

    this.activePlayer = this.game.players.list[0] ?? null;
    this.lastWinnerLogged = null;
    this.matchPicker?.setActive(null);
    this.controls.log(`🛠 Custom map · ${width}×${height} · ${numPlayers} bots`);
    this.bindCanvas();
    this.playing = true;
    this.controls.setPlaying(true);
    this.markDirty();
  }

  bindCanvas() {
    if (this._canvasBound) return;
    this._canvasBound = true;
    this.canvas.addEventListener("mousemove", (e) => {
      this.renderer.hoverTile = this.renderer.pixelToTile(e.clientX, e.clientY);
      this.updateTileTooltip(e.clientX, e.clientY);
      this.markDirty();
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.renderer.hoverTile = null;
      this.hideTileTooltip();
      this.markDirty();
    });
    this.canvas.addEventListener("click", (e) => {
      const tile = this.renderer.pixelToTile(e.clientX, e.clientY);
      if (!tile) return;
      this.renderer.selectedTile = tile;
      this.markDirty();
    });
  }

  ensureTileTooltip() {
    if (this._tileTooltip) return this._tileTooltip;
    const el = document.createElement("div");
    el.className = "tile-tooltip";
    el.style.display = "none";
    document.body.appendChild(el);
    this._tileTooltip = el;
    return el;
  }

  updateTileTooltip(clientX, clientY) {
    const tile = this.renderer.hoverTile;
    if (!tile || !tile.armies || tile.armies.length === 0) {
      this.hideTileTooltip();
      return;
    }
    const el = this.ensureTileTooltip();
    const rows = tile.armies
      .filter((a) => a.alive)
      .map((a) => {
        const s = a.strength.toFixed(1);
        const max = a.maxStrength;
        const pct = Math.round((a.strength / a.maxStrength) * 100);
        return `<div class="tile-tooltip-row"><span class="tile-tooltip-dot" style="background:${a.player.color}"></span><span class="tile-tooltip-name">${a.player.name}</span><span class="tile-tooltip-num">${s} / ${max} <span class="tile-tooltip-dim">(${pct}%)</span></span></div>`;
      })
      .join("");
    if (!rows) {
      this.hideTileTooltip();
      return;
    }
    el.innerHTML = `<div class="tile-tooltip-head">Tile (${tile.pos.x}, ${tile.pos.y})</div>${rows}`;
    el.style.display = "block";
    const pad = 14;
    const rect = el.getBoundingClientRect();
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + rect.width > window.innerWidth - 4) x = clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 4) y = clientY - rect.height - pad;
    el.style.left = `${Math.max(4, x)}px`;
    el.style.top = `${Math.max(4, y)}px`;
  }

  hideTileTooltip() {
    if (this._tileTooltip) this._tileTooltip.style.display = "none";
  }

  togglePlay() {
    this.playing = !this.playing;
    this.controls.setPlaying(this.playing);
    this.markDirty();
  }

  stepOnce() {
    this.game.step(this.tickInterval);
    this.markDirty();
  }

  reload() {
    if (this.replayEntry) {
      this.loadReplay(this.replayEntry);
    } else if (this.lastCustomArgs) {
      this.loadCustomMap(this.lastCustomArgs);
    } else {
      this.loadCustomMap(this.mapEditor.read());
    }
  }

  markDirty() {
    this._needsRender = true;
  }

  startLoop() {
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      if (this.playing) {
        this.tickAccumulator += dt * this.speed;
        let safety = 32;
        while (this.tickAccumulator >= this.tickInterval && safety-- > 0) {
          this.game.step(this.tickInterval);
          this.tickAccumulator -= this.tickInterval;
        }
      }
      const shouldRender =
        this._needsRender || (this.playing && now - this.lastRender >= this.renderInterval);
      if (shouldRender) {
        if (this.game._territoryDirty) this.game.recomputeTerritory();
        this.renderer.draw(now);
        this.chart.draw();
        this.territoryChart.draw();
        this.hud.update();
        this.controls.setTick(this.game.tick);
        this.lastRender = now;
        this._needsRender = false;
      }
      this.checkWinner();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  checkWinner() {
    const alive = this.game.livingPlayers();
    if (alive.length === 1 && this.game.tick > 30 && this.lastWinnerLogged !== alive[0].id) {
      this.lastWinnerLogged = alive[0].id;
      this.controls.log(`👑 ${alive[0].name} wins!`);
      if (this.autoStopOnWinner && this.playing) {
        this.playing = false;
        this.controls.setPlaying(false);
      }
    } else if (alive.length === 0 && this.game.tick > 30 && this.lastWinnerLogged !== "draw") {
      this.lastWinnerLogged = "draw";
      this.controls.log(`💀 Mutual destruction.`);
      if (this.autoStopOnWinner && this.playing) {
        this.playing = false;
        this.controls.setPlaying(false);
      }
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
