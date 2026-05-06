import { Game } from "./core/Game.js";
import { Player } from "./core/Player.js";
import { mulberry32 } from "./core/rng.js";
import { startingBlobSide, placeStartingBlob } from "./core/startup.js";
import { MODES } from "./modes/index.js";
import { Renderer } from "./render/Renderer.js";
import { StatsChart } from "./render/StatsChart.js";
import { HUD } from "./ui/HUD.js";
import { Controls } from "./ui/Controls.js";
import { MatchPicker } from "./ui/MatchPicker.js";
import { LeagueViewer } from "./ui/LeagueViewer.js";
import { ALL_STRATEGIES } from "./strategies/index.js";
import { MAPS } from "../tournament/maps.js";

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
    this.hudRoot = document.getElementById("hud-root");
    this.modeKey = "classic";
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
    // replays of saved matches and live league-tier matches. In sandbox
    // / classic / arena the user usually wants to keep watching past
    // the first elimination, so it stays off there.
    this.autoStopOnWinner = false;
    // Tracks whether the user has already changed mode / picked a match
    // so the async league loader doesn't yank them out of an active view.
    this._userChoseMode = false;

    this.populateModeSelect();
    this.loadMode(this.modeKey);
    this.matchPicker = new MatchPicker({
      root: document.getElementById("match-picker"),
      refreshButton: document.getElementById("btn-matches-refresh"),
      app: this,
    });
    this.leagueViewer = new LeagueViewer({
      root: document.getElementById("league-viewer"),
      refreshButton: document.getElementById("btn-leagues-refresh"),
      app: this,
      // First time leagues finish loading, default to a top-tier match
      // so visitors land on the marquee competition rather than Classic
      // (unless they've already clicked something).
      onFirstLoad: (leagues) => {
        if (this._userChoseMode) return;
        if (!leagues.length) return;
        const args = this.leagueViewer.topTierArgs();
        if (args) this.loadLeagueMatch(args);
      },
    });
    this.startLoop();
  }

  populateModeSelect() {
    const sel = document.getElementById("mode-select");
    sel.innerHTML = "";
    for (const [key, m] of Object.entries(MODES)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = m.name;
      sel.appendChild(opt);
    }
    sel.value = this.modeKey;
  }

  loadMode(key) {
    this.modeKey = key;
    this.replayEntry = null;
    this.autoStopOnWinner = false;
    const def = MODES[key];
    this.mode = { key, ...def };
    this.game = new Game(def.config);
    def.setup(this.game);

    document.getElementById("mode-description").textContent = def.description;

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

    if (!this.hud) {
      this.hud = new HUD({ root: this.hudRoot, game: this.game, app: this });
    } else {
      this.hud.setGame(this.game);
    }

    this.activePlayer = this.game.players.list[0] ?? null;
    this.lastWinnerLogged = null;
    this.controls.setMode(key);
    this.matchPicker?.setActive(null);
    this.controls.log(`Loaded "${def.name}"`);
    this.bindCanvas();
    this.playing = true;
    this.controls.setPlaying(true);
    this.markDirty();
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

  loadLeagueMatch({ leagueMap, mapConfig, tierIndex, tierBots, poolSize, seed }) {
    // Pick a deterministic K-of-tier sample from the seed, then play the
    // match using the league's map config. Uses the same seed for both the
    // sampling RNG and the game RNG so a (tier, seed) pair fully determines
    // what the user watches.
    const k = Math.min(poolSize ?? 6, tierBots.length);
    const sampleRng = mulberry32(seed);
    const pool = tierBots.slice();
    const sampled = [];
    for (let i = 0; i < k; i++) {
      const j = Math.floor(sampleRng() * pool.length);
      sampled.push(pool.splice(j, 1)[0]);
    }
    const strategies = sampled.map((name) => {
      const s = ALL_STRATEGIES[name];
      if (!s) throw new Error(`League references unknown strategy: ${name}`);
      return s;
    });

    this.replayEntry = null;
    this.autoStopOnWinner = true;
    this.modeKey = "league";
    this.mode = { key: "league", name: `League · Tier ${tierIndex + 1}` };
    this.game = new Game({ ...mapConfig, seed });
    // The headless arena uses ringPositions per the map preset; we mirror
    // it exactly so the visible match matches what runMatch would produce
    // for the same (lineup, seed).
    const positions = MAPS[leagueMap].positions(strategies.length);

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
      `League · ${leagueMap} · Tier ${tierIndex + 1} · seed=${seed} · ${sampled.length} bots`;
    this.lastLeagueArgs = { leagueMap, mapConfig, tierIndex, tierBots, poolSize, seed };

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
    if (!this.hud) {
      this.hud = new HUD({ root: this.hudRoot, game: this.game, app: this });
    } else {
      this.hud.setGame(this.game);
    }

    this.activePlayer = this.game.players.list[0] ?? null;
    this.lastWinnerLogged = null;
    this.matchPicker?.setActive(null);
    this.controls.log(`🏆 League Tier ${tierIndex + 1} · ${sampled.join(", ")}`);
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
      if (this.mode.key === "sandbox" && this.activePlayer) {
        this.game.placeArmy({ x: tile.pos.x, y: tile.pos.y, player: this.activePlayer, strength: 2 });
        this.controls.log(`Spawned ${this.activePlayer.name} army at (${tile.pos.x}, ${tile.pos.y})`);
      }
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

  setActivePlayer(player) {
    this.activePlayer = player;
    this.hud.update();
    this.markDirty();
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
    } else if (this.modeKey === "league" && this.lastLeagueArgs) {
      this.loadLeagueMatch(this.lastLeagueArgs);
    } else {
      this.loadMode(this.modeKey);
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
