import { EngineClient } from "./client/EngineClient.js";
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
    this._needsRender = true;
    this.activePlayer = null;

    // Engine boundary: the simulation runs in a worker, the client
    // exposes a GameView that renderer / HUD / charts read like a
    // local Game. Nothing downstream needs to know there's a worker.
    this.engine = new EngineClient();
    this.game = this.engine.game;

    this.renderer = new Renderer({ canvas: this.canvas, game: this.game });
    this.chart = new StatsChart({ canvas: this.chartCanvas, game: this.game });
    this.territoryChart = new TerritoryChart({
      canvas: this.territoryChartCanvas,
      game: this.game,
    });
    this.hud = new HUD({ root: this.hudRoot, game: this.game, app: this });

    this.engine.on("snapshot", () => this.markDirty());
    this.engine.on("players:changed", () => this.markDirty());
    this.engine.on("winner", ({ name }) => {
      this.controls.log(`👑 ${name} wins!`);
      if (this.autoStopOnWinner && this.playing) this._setPlayingLocal(false);
    });
    this.engine.on("draw", () => {
      this.controls.log(`💀 Mutual destruction.`);
      if (this.autoStopOnWinner && this.playing) this._setPlayingLocal(false);
    });

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
    const strategies = entry.lineup.map((name) => {
      const s = ALL_STRATEGIES[name];
      if (!s) throw new Error(`Replay references unknown strategy: ${name}`);
      return s;
    });

    this.replayEntry = entry;
    this.autoStopOnWinner = true;
    this.modeKey = "replay";
    this.mode = { key: "replay", name: `Replay #${entry.id}` };

    this.engine.loadReplay({
      mapConfig: entry.mapConfig,
      seed: entry.seed,
      lineupStrategies: strategies,
      lineupTech: entry.lineupTech ?? null,
      startPositions: entry.startPositions,
    });
    this.renderer.resize();
    this.chart.resize();
    this.territoryChart.resize();

    const flagText = (entry.flags ?? []).map((f) => f.tag).join(" · ") || "saved";
    document.getElementById("mode-description").textContent =
      `Replay #${entry.id} · ${entry.map} · seed=${entry.seed} · ${flagText}`;

    this.activePlayer = this.game.players.list[0] ?? null;
    this.matchPicker?.setActive(entry.id);
    this.controls.log(`▶ Replay #${entry.id} · ${entry.lineup.join(", ")}`);
    this.bindCanvas();
    this._setPlayingLocal(true);
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

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.4;
    const startPositions = [];
    for (let i = 0; i < numPlayers; i++) {
      const angle = (i / numPlayers) * Math.PI * 2;
      const x = Math.max(1, Math.min(width - 2, Math.floor(cx + Math.cos(angle) * r)));
      const y = Math.max(1, Math.min(height - 2, Math.floor(cy + Math.sin(angle) * r)));
      startPositions.push({ x, y });
    }

    this.engine.loadCustom({
      mapConfig: { width, height, growth, maxArmy, wrap },
      lineupStrategies: strategies,
      startPositions,
      seed,
    });
    this.renderer.resize();
    this.chart.resize();
    this.territoryChart.resize();

    document.getElementById("mode-description").textContent =
      `Custom · ${width}×${height} · g=${growth} · maxArmy=${maxArmy}${wrap ? " · wrap" : ""} · ${numPlayers} bots`;

    this.activePlayer = this.game.players.list[0] ?? null;
    this.matchPicker?.setActive(null);
    this.controls.log(`🛠 Custom map · ${width}×${height} · ${numPlayers} bots`);
    this.bindCanvas();
    this._setPlayingLocal(true);
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
    this._setPlayingLocal(!this.playing);
  }

  _setPlayingLocal(playing) {
    this.playing = !!playing;
    this.controls.setPlaying(this.playing);
    this.engine.setPlaying(this.playing);
  }

  setSpeed(speed) {
    this.speed = speed;
    this.engine.setSpeed(speed);
  }

  setOverlay(enabled) {
    // Plan caches only cross the worker boundary while overlay is on.
    // Toggle both sides in lock-step so a stale plan from a prior tick
    // doesn't render after the user disables the overlay.
    this.renderer.showOverlay = !!enabled;
    this.engine.setOverlay(!!enabled);
    this.markDirty();
  }

  stepOnce() {
    this.engine.stepOnce();
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
    // Engine simulation runs in the worker. The main thread only
    // renders, so a slow tick on a big map cannot block scroll, hover,
    // or HUD interactions.
    const loop = (now) => {
      if (this._needsRender) {
        this.renderer.draw(now);
        this.chart.draw();
        this.territoryChart.draw();
        this.hud.update();
        this.controls.setTick(this.game.tick);
        this._needsRender = false;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
