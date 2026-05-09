import { EngineClient } from "./client/EngineClient.js";
import { Renderer } from "./render/Renderer.js";
import { StatsChart } from "./render/StatsChart.js";
import { TerritoryChart } from "./render/TerritoryChart.js";
import { HUD } from "./ui/HUD.js";
import { Controls } from "./ui/Controls.js";
import { MatchPicker } from "./ui/MatchPicker.js";
import { LeagueViewer } from "./ui/LeagueViewer.js";
import { MapEditor } from "./ui/MapEditor.js";
import { CodeModal } from "./ui/CodeModal.js";
import { CustomBots, loadStrategyFromCode } from "./ui/CustomBots.js";
import { getStrategySource } from "./ui/strategySource.js";
import { readUrlMatchInfo, updateUrl } from "./ui/shareLink.js";
import { ALL_STRATEGIES, STRATEGY_LIST } from "./strategies/index.js";

// Pick the a×b factorization of `n` that gives cells closest to square
// for this map's aspect ratio, then drop seeds at each cell's center.
// Every cell is congruent (same shape, same wrap relationship to its
// neighbors), so all players start with identical geometry — unlike a
// circle layout, where on a non-square wrap map the cardinal pairs
// have different wrap distances and asymmetric blob clipping.
function gridPositions(n, width, height) {
  if (n === 1) return [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }];
  let best = null;
  for (let a = 1; a <= n; a++) {
    if (n % a !== 0) continue;
    const b = n / a;
    const cellW = width / a;
    const cellH = height / b;
    const aspect = Math.max(cellW, cellH) / Math.min(cellW, cellH);
    if (!best || aspect < best.aspect) best = { a, b, aspect };
  }
  const { a, b } = best;
  const out = [];
  for (let j = 0; j < b; j++) {
    for (let i = 0; i < a; i++) {
      out.push({
        x: Math.round(width * (i + 0.5) / a) % width,
        y: Math.round(height * (j + 0.5) / b) % height,
      });
    }
  }
  return out;
}

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
      this.controls.log(`👑 ${name} wins!`, this._snapshotMatchInfo());
      if (this.autoStopOnWinner && this.playing) this._setPlayingLocal(false);
    });
    this.engine.on("draw", () => {
      this.controls.log(`💀 Mutual destruction.`, this._snapshotMatchInfo());
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

    this.ratings = null;

    this.customBots = new CustomBots();
    this.codeModal = new CodeModal();
    this._bindTryBotButton();

    this.matchPicker = new MatchPicker({
      root: document.getElementById("match-picker"),
      refreshButton: document.getElementById("btn-matches-refresh"),
      app: this,
    });
    this.mapEditor = new MapEditor({ app: this });
    // Initial match: prefer a shared URL if one is present, otherwise
    // seed the canvas with default form values + top of STRATEGY_LIST
    // so something renders before rankings.json loads.
    const urlInfo = readUrlMatchInfo();
    const loadedFromUrl = urlInfo ? this._tryLoadFromUrl(urlInfo) : false;
    if (!loadedFromUrl) {
      this.loadCustomMap(this.mapEditor.read());
      // Reset the override flag so the rankings loader can replace the
      // initial canvas with a top-tier match once rankings.json arrives.
      this._userChoseMode = false;
    }
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
    this.currentMatch = {
      kind: "replay",
      id: entry.id,
      map: entry.map,
      mapConfig: entry.mapConfig,
      seed: entry.seed,
      lineup: entry.lineup,
      lineupTech: entry.lineupTech ?? null,
      startPositions: entry.startPositions,
    };

    this.engine.loadReplay({
      mapConfig: entry.mapConfig,
      seed: entry.seed,
      lineupStrategies: strategies,
      lineupTech: entry.lineupTech ?? null,
      startPositions: entry.startPositions,
      ratings: this.ratings,
    });
    this.renderer.resetView();
    this.renderer.resize();
    this.chart.resize();
    this.territoryChart.resize();

    const flagText = (entry.flags ?? []).map((f) => f.tag).join(" · ") || "saved";
    document.getElementById("mode-description").textContent =
      `Replay #${entry.id} · ${entry.map} · seed=${entry.seed} · ${flagText}`;

    this.activePlayer = this.game.players.list[0] ?? null;
    this.matchPicker?.setActive(entry.id);
    this.controls.log(`▶ Replay #${entry.id} · ${entry.lineup.join(", ")}`);
    this.controls.updateMatchInfo(this.currentMatch);
    this.bindCanvas();
    this._setPlayingLocal(true);
    this.markDirty();
    updateUrl(this.currentMatch);
  }

  loadCustomMap({ width, height, growth, maxArmy, wrap, numPlayers, botNames = null, fixedLineup = false, seed = null, startPositions = null }) {
    // Transient ad-hoc map: build a Game with the user's config and seat
    // N bots in a ring. If `botNames` is given:
    //   - fixedLineup=true: use the names in order (Reset path).
    //   - otherwise: sample numPlayers random names from the pool.
    // No botNames → top of STRATEGY_LIST.
    const lookupBot = (n) => this.customBots.getStrategy(n) ?? ALL_STRATEGIES[n];
    let strategies;
    if (botNames) {
      const pool = botNames.map(lookupBot).filter(Boolean);
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
      // Default lineup: any pasted custom bots take the front slots so a
      // fresh "Use in match" actually shows up without manual setup.
      const customs = this.customBots.list().map((e) => e.strategy);
      const corePool = STRATEGY_LIST.filter((s) => !this.customBots.has(s.name));
      const merged = [...customs, ...corePool];
      strategies = merged.slice(0, numPlayers);
      if (strategies.length < numPlayers) {
        throw new Error(`Not enough strategies for ${numPlayers} players`);
      }
    }
    const useSeed = seed != null ? (seed >>> 0) : ((Date.now() & 0x7fffffff) >>> 0);

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

    const positions = startPositions ?? gridPositions(numPlayers, width, height);

    this.currentMatch = {
      kind: "custom",
      id: null,
      map: "custom",
      mapConfig: { width, height, growth, maxArmy, wrap },
      seed: useSeed,
      lineup: strategies.map((s) => s.name),
      lineupTech: null,
      startPositions: positions,
    };

    this.engine.loadCustom({
      mapConfig: { width, height, growth, maxArmy, wrap },
      lineupStrategies: strategies,
      startPositions: positions,
      seed: useSeed,
      customStrategies: this.customBots.serializeUsed(strategies.map((s) => s.name)),
      ratings: this.ratings,
    });
    this.renderer.resetView();
    this.renderer.resize();
    this.chart.resize();
    this.territoryChart.resize();

    document.getElementById("mode-description").textContent =
      `Custom · ${width}×${height} · g=${growth} · maxArmy=${maxArmy}${wrap ? " · wrap" : ""} · ${numPlayers} bots · seed=${useSeed}`;

    this.activePlayer = this.game.players.list[0] ?? null;
    this.matchPicker?.setActive(null);
    this.controls.log(`🛠 Custom map · ${width}×${height} · ${numPlayers} bots · seed=${useSeed}`);
    this.controls.updateMatchInfo(this.currentMatch);
    this.bindCanvas();
    this._setPlayingLocal(true);
    this.markDirty();
    updateUrl(this.currentMatch);
  }

  // Best-effort load of a match described by URL query params. Returns
  // true on success, false if the URL doesn't carry enough info or if
  // any referenced bot isn't available — in which case the caller falls
  // back to the default startup flow.
  _tryLoadFromUrl(info) {
    if (!info || !info.mapConfig) return false;
    const c = info.mapConfig;
    const lookupBot = (n) => this.customBots.getStrategy(n) ?? ALL_STRATEGIES[n];
    const hasLineup = Array.isArray(info.lineup) && info.lineup.length > 0;
    if (hasLineup && info.lineup.some((n) => !lookupBot(n))) {
      console.warn("Shared link references unknown bot(s); using defaults.", info.lineup);
      return false;
    }
    const numPlayers = hasLineup ? info.lineup.length : null;
    this.mapEditor.write({
      width: c.width,
      height: c.height,
      growth: c.growth,
      maxArmy: c.maxArmy,
      wrap: c.wrap,
      numPlayers,
    });
    this._userChoseMode = true;
    try {
      this.loadCustomMap({
        width: c.width,
        height: c.height,
        growth: c.growth,
        maxArmy: c.maxArmy,
        wrap: !!c.wrap,
        numPlayers: numPlayers ?? this.mapEditor.read().numPlayers,
        botNames: hasLineup ? info.lineup : null,
        fixedLineup: hasLineup,
        seed: info.seed,
        startPositions: info.startPositions,
      });
      return true;
    } catch (err) {
      console.warn("Couldn't load shared match from URL:", err);
      return false;
    }
  }

  setRatings(ratings) {
    this.ratings = ratings;
    this.hud?.render();
  }

  // Snapshot the current match in a form ready for `loadFromMatchInfo` or
  // `saveCurrentMatch`. Returns null if no match has been loaded yet.
  _snapshotMatchInfo() {
    return this.currentMatch ? { ...this.currentMatch } : null;
  }

  // Re-run the match described by `info`. Used by the event log click
  // handler to replay any past winner/draw line, and by the saved-match
  // panel for browser-side stored entries.
  loadFromMatchInfo(info) {
    if (!info) return;
    this._userChoseMode = true;
    if (info.kind === "replay" || info.id != null) {
      this.loadReplay({
        id: info.id,
        map: info.map,
        mapConfig: info.mapConfig,
        seed: info.seed,
        lineup: info.lineup,
        lineupTech: info.lineupTech ?? null,
        startPositions: info.startPositions,
        flags: info.flags ?? [],
      });
      return;
    }
    const cfg = info.mapConfig;
    this.loadCustomMap({
      width: cfg.width,
      height: cfg.height,
      growth: cfg.growth,
      maxArmy: cfg.maxArmy,
      wrap: !!cfg.wrap,
      numPlayers: info.lineup.length,
      botNames: info.lineup,
      fixedLineup: true,
      seed: info.seed,
      startPositions: info.startPositions,
    });
  }

  // Re-run with the same seed as the current match. Pairs with
  // `reload()` (Reset = new seed).
  replaySameSeed() {
    if (!this.currentMatch) {
      this.reload();
      return;
    }
    this.loadFromMatchInfo(this.currentMatch);
  }

  // Persist the current match to localStorage so it shows up alongside
  // the static tournament/interesting.json picks.
  saveCurrentMatch() {
    if (!this.currentMatch) {
      this.controls.log("⚠ Nothing to save yet.");
      return null;
    }
    const saved = this.matchPicker?.saveLocal(this.currentMatch) ?? null;
    if (saved) {
      this.controls.log(`★ Saved seed=${saved.seed} as ${saved.id}`);
    }
    return saved;
  }

  bindCanvas() {
    if (this._canvasBound) return;
    this._canvasBound = true;

    // Drag state lives on `this` so the global mouseup/mousemove
    // listeners (which see drags that finish off-canvas) share it
    // with the canvas-scoped click handler. A 4-px threshold lets a
    // shaky click still register as a tile select rather than a pan.
    const DRAG_THRESHOLD_PX = 4;
    this._dragging = false;
    this._dragMoved = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this._dragMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.style.cursor = "grabbing";
      e.preventDefault();
    });

    // Pan listener attaches to window so a drag that escapes the
    // canvas keeps tracking until release.
    window.addEventListener("mousemove", (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const totalDx = Math.abs(e.clientX - dragStartX);
      const totalDy = Math.abs(e.clientY - dragStartY);
      if (!this._dragMoved && totalDx + totalDy > DRAG_THRESHOLD_PX) {
        this._dragMoved = true;
      }
      if (this._dragMoved) {
        this.renderer.panByPixels(dx, dy);
        this.markDirty();
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      this.canvas.style.cursor = "";
    });

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
      // A drag that crossed the threshold ate this click — selecting
      // a tile at drag-release would be jarring on a long pan.
      if (this._dragMoved) {
        this._dragMoved = false;
        return;
      }
      const tile = this.renderer.pixelToTile(e.clientX, e.clientY);
      if (!tile) return;
      this.renderer.selectedTile = tile;
      this.markDirty();
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.renderer.zoomAt(e.clientX, e.clientY, factor);
      // Hover tile changes after zoom even without a fresh mousemove.
      this.renderer.hoverTile = this.renderer.pixelToTile(e.clientX, e.clientY);
      this.updateTileTooltip(e.clientX, e.clientY);
      this.markDirty();
    }, { passive: false });
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

  _bindTryBotButton() {
    const btn = document.getElementById("btn-try-bot");
    if (!btn) return;
    btn.addEventListener("click", () => {
      this.codeModal.openEdit({
        onSubmit: ({ name, code }) => this.useCustomBot({ name, code }),
      });
    });
  }

  // Open the read-only code viewer for a strategy by name. Looks at
  // pasted bots first, then falls back to fetching the file from disk
  // (or to act.toString() for factory-built bots).
  async viewStrategyCode(name) {
    const strategy = this.customBots.getStrategy(name) ?? ALL_STRATEGIES[name];
    if (!strategy) return;
    this.codeModal.openView({
      title: name,
      subtitle: "Loading source…",
      code: "",
    });
    const { source, origin } = await getStrategySource(strategy, { customBots: this.customBots });
    const subtitle = origin === "custom"
      ? "Custom bot from this session."
      : origin === "act-toString"
        ? "Source not on disk; showing act() as compiled."
        : `From ${origin}`;
    this.codeModal.openView({ title: name, subtitle, code: source });
  }

  // Validate and register a pasted bot, then immediately reload the
  // current map with the new bot seated in slot 0. Subsequent random
  // pools also include it.
  async useCustomBot({ name, code }) {
    let strategy;
    try {
      strategy = await loadStrategyFromCode(code);
    } catch (err) {
      throw new Error(`Couldn't load module: ${err.message}`);
    }
    this.customBots.add({ name, code, strategy });
    this._userChoseMode = true;
    const config = this.mapEditor.read();
    const { numPlayers } = config;
    const otherCustoms = this.customBots
      .list()
      .map((e) => e.name)
      .filter((n) => n !== name);
    const corePool = STRATEGY_LIST.map((s) => s.name)
      .filter((n) => !this.customBots.has(n));
    const fillers = [...otherCustoms, ...corePool].slice(0, Math.max(0, numPlayers - 1));
    const botNames = [name, ...fillers];
    this.loadCustomMap({ ...config, botNames, fixedLineup: true });
    this.controls.log(`⚙ Loaded custom bot "${name}" — seated in slot 1`);
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
