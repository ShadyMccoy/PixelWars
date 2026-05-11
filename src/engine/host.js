// Headless engine driver. Wraps a Game with a postMessage-friendly API:
// init from a serializable spec, run on a self-managed tick loop, emit
// snapshots and lifecycle events through callbacks. Doesn't know it's
// running in a worker - the same class powers the browser today and can
// drive headless or test contexts unchanged.
//
// The boundary contract: every input is a plain serializable object,
// every output goes through `emit(event, payload)` where payload is also
// plain data. No live engine references escape.

import { Game } from "../core/Game.js";
import { Player } from "../core/Player.js";
import { startingBlobSide, placeStartingBlobs } from "../core/startup.js";
import { ALL_STRATEGIES } from "../strategies/index.js";
import {
  EVT_SNAPSHOT,
  EVT_PLAYERS_CHANGED,
  EVT_WINNER,
  EVT_DRAW,
  EVT_READY,
} from "./protocol.js";

const DEFAULT_TICK_INTERVAL = 1 / 30;
const DEFAULT_SNAPSHOT_INTERVAL_MS = 100;
const SCHEDULE_INTERVAL_MS = 16;
const TICK_SAFETY = 32;

// Plan-cache key prefixes that strategies/painter.js writes onto the
// Game object. Listed here so the snapshot can ferry them across the
// boundary - the renderer reads `game[`${prefix}${pid}`]` exactly the
// way it does on a live engine. Keep in sync with painter.js.
const PLAN_PREFIXES = [
  "_frontierPlan_",
  "_pressureSinkPlan_",
  "_citadelSortiePlan_",
];

export class EngineHost {
  constructor({ emit }) {
    this.emit = emit;
    this.game = null;
    this.playing = false;
    this.speed = 1;
    this.tickInterval = DEFAULT_TICK_INTERVAL;
    this.snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL_MS;
    this.tickAccumulator = 0;
    this.lastFrameTime = 0;
    this.lastSnapshotTime = 0;
    this._snapshotPending = true;
    this._loopHandle = null;
    this._lastWinnerLogged = null;
    this._minTick = 30; // matches main.js winner heuristic
    this._initSpec = null;
    this._overlayEnabled = false;
    // Strategies the user pasted via "Try a bot". Source code arrives
    // in the init payload; we eval each one to a real strategy object
    // exactly once, then look it up by name when seating players.
    this._customStrategies = new Map();
    this._timeNow = typeof performance !== "undefined" && performance.now
      ? () => performance.now()
      : () => Date.now();

    this.emit(EVT_READY, {});
  }

  setSnapshotInterval(ms) {
    if (Number.isFinite(ms) && ms >= 16) this.snapshotInterval = ms;
  }

  setOverlay(enabled) {
    const next = !!enabled;
    if (next === this._overlayEnabled) return;
    this._overlayEnabled = next;
    // Force a fresh snapshot so the client gets / drops plan data
    // immediately rather than waiting for the next interval tick.
    this._snapshotPending = true;
    if (this.game) this._postSnapshot(this._timeNow());
  }

  async initCustom(spec) {
    // spec: { mapConfig, lineup: [strategyName], palette, numPlayers, seed,
    //         startPositions?, customStrategies? }
    this._initSpec = { kind: "custom", spec };
    await this._registerCustom(spec.customStrategies);
    this._buildGame(spec);
    this._snapshotPending = true;
    this.emit(EVT_PLAYERS_CHANGED, { players: this._serializePlayers() });
    this._postSnapshot(this._timeNow());
  }

  async initReplay(spec) {
    // spec: { mapConfig, seed, lineup: [strategyName], lineupTech,
    //         startPositions, palette }
    this._initSpec = { kind: "replay", spec };
    await this._registerCustom(spec.customStrategies);
    this._buildReplay(spec);
    this._snapshotPending = true;
    this.emit(EVT_PLAYERS_CHANGED, { players: this._serializePlayers() });
    this._postSnapshot(this._timeNow());
  }

  async reset() {
    if (!this._initSpec) return;
    if (this._initSpec.kind === "custom") {
      await this._registerCustom(this._initSpec.spec.customStrategies);
      this._buildGame(this._initSpec.spec);
    } else {
      await this._registerCustom(this._initSpec.spec.customStrategies);
      this._buildReplay(this._initSpec.spec);
    }
    this._lastWinnerLogged = null;
    this._snapshotPending = true;
    this.emit(EVT_PLAYERS_CHANGED, { players: this._serializePlayers() });
    this._postSnapshot(this._timeNow());
  }

  setPlaying(playing) {
    this.playing = !!playing;
    this.lastFrameTime = this._timeNow();
    this.tickAccumulator = 0;
    if (this.playing) this._ensureLoop();
  }

  setSpeed(speed) {
    if (Number.isFinite(speed) && speed > 0) this.speed = speed;
  }

  stepOnce() {
    if (!this.game) return;
    this.game.step(this.tickInterval);
    this._snapshotPending = true;
    this._checkWinner();
    this._postSnapshot(this._timeNow());
  }

  // --- Internals ----------------------------------------------------------

  // Convert pasted-bot source into runnable strategy objects. Each
  // entry is loaded via a Blob URL so dynamic import() can pull the
  // module's default export. We cache by name+code so reset and
  // re-init don't re-import the same source.
  async _registerCustom(customStrategies) {
    if (!customStrategies || customStrategies.length === 0) return;
    for (const { name, code } of customStrategies) {
      const existing = this._customStrategies.get(name);
      if (existing && existing.__sourceCode === code) continue;
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      try {
        const mod = await import(/* webpackIgnore: true */ url);
        const def = mod.default;
        if (!def || typeof def.act !== "function") {
          throw new Error(`Custom bot ${name}: default export missing act()`);
        }
        def.name = name;
        def.__sourceCode = code;
        this._customStrategies.set(name, def);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  _buildGame(spec) {
    const { mapConfig, lineup, palette, startPositions, seed } = spec;
    this.game = new Game({ ...mapConfig, seed });
    const strategies = lineup.map((name) => {
      const s = this._customStrategies.get(name) ?? ALL_STRATEGIES[name];
      if (!s) throw new Error(`Unknown strategy: ${name}`);
      return s;
    });
    const players = strategies.map((s, i) => {
      const p = palette[i % palette.length];
      return new Player({
        name: `${s.name}#${i + 1}`,
        color: p.color,
        accent: p.accent,
        strategy: s,
        tech: s.tech,
      });
    });
    players.forEach((p) => this.game.addPlayer(p));
    const side = startingBlobSide(this.game.map, startPositions.length);
    placeStartingBlobs(this.game, players, startPositions, side);
  }

  _buildReplay(spec) {
    const { mapConfig, seed, lineup, lineupTech, startPositions, palette } = spec;
    const strategies = lineup.map((name) => {
      const s = this._customStrategies.get(name) ?? ALL_STRATEGIES[name];
      if (!s) throw new Error(`Replay references unknown strategy: ${name}`);
      return s;
    });
    this.game = new Game({ ...mapConfig, seed });
    const players = strategies.map((s, i) => {
      const p = palette[i % palette.length];
      const tech = lineupTech?.[i] ?? s.tech;
      return new Player({
        name: `${s.name}#${i + 1}`,
        color: p.color,
        accent: p.accent,
        strategy: s,
        tech,
      });
    });
    players.forEach((p) => this.game.addPlayer(p));
    const side = startingBlobSide(this.game.map, startPositions.length);
    placeStartingBlobs(this.game, players, startPositions, side);
  }

  _ensureLoop() {
    if (this._loopHandle != null) return;
    const tick = () => {
      this._loopHandle = null;
      this._tick();
      // Reschedule even if paused so a one-shot snapshot or play resume
      // is observed promptly. Cheap: a no-op tick is microseconds.
      if (this.playing || this._snapshotPending) {
        this._loopHandle = setTimeout(tick, SCHEDULE_INTERVAL_MS);
      }
    };
    this._loopHandle = setTimeout(tick, SCHEDULE_INTERVAL_MS);
  }

  _tick() {
    if (!this.game) return;
    const now = this._timeNow();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    if (this.playing) {
      this.tickAccumulator += dt * this.speed;
      let safety = TICK_SAFETY;
      while (this.tickAccumulator >= this.tickInterval && safety-- > 0) {
        this.game.step(this.tickInterval);
        this.tickAccumulator -= this.tickInterval;
      }
      this._checkWinner();
    }
    if (this._snapshotPending || now - this.lastSnapshotTime >= this.snapshotInterval) {
      this._postSnapshot(now);
    }
  }

  _checkWinner() {
    const game = this.game;
    if (!game) return;
    const alive = game.livingPlayers();
    if (alive.length === 1 && game.tick > this._minTick && this._lastWinnerLogged !== alive[0].id) {
      this._lastWinnerLogged = alive[0].id;
      this.emit(EVT_WINNER, { id: alive[0].id, name: alive[0].name });
    } else if (alive.length === 0 && game.tick > this._minTick && this._lastWinnerLogged !== "draw") {
      this._lastWinnerLogged = "draw";
      this.emit(EVT_DRAW, {});
    }
  }

  _postSnapshot(now) {
    if (!this.game) return;
    if (this.game._territoryDirty) this.game.recomputeTerritory();
    this.lastSnapshotTime = now;
    this._snapshotPending = false;
    this.emit(EVT_SNAPSHOT, this._serializeSnapshot());
  }

  _serializePlayers() {
    return this.game.players.list.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      accent: p.accent,
      strategy: p.strategy
        ? {
            name: p.strategy.name ?? null,
            summary: p.strategy.summary ?? null,
            description: p.strategy.description ?? null,
          }
        : null,
      tech: { ...p.tech },
      techMults: { ...p.techMults },
      totals: { ...p.totals },
    }));
  }

  _serializeSnapshot() {
    const game = this.game;
    const armies = [];
    const liveArmies = game.armies;
    for (let i = 0; i < liveArmies.length; i++) {
      const a = liveArmies[i];
      if (!a.alive) continue;
      armies.push({
        id: a.id,
        x: a.pos.x,
        y: a.pos.y,
        strength: a.strength,
        maxStrength: a.maxStrength,
        playerId: a.player.id,
      });
    }

    const playerTotals = game.players.list.map((p) => ({
      id: p.id,
      strength: p.totals.strength,
      territory: p.totals.territory,
      armies: p.totals.armies,
    }));

    // History payload: send the full ring buffer. Bounded by maxHistory
    // (240 by default), so this is small. Cheaper than diffing across
    // resets, and lets the client treat each snapshot as authoritative.
    const history = game.history.map((s) => {
      const out = { t: s.t };
      const terr = {};
      for (const p of game.players.list) {
        out[p.id] = s[p.id] ?? 0;
        if (s.terr) terr[p.id] = s.terr[p.id] ?? 0;
      }
      out.terr = terr;
      return out;
    });

    const recentMoves = game.recentMoves.map((m) => ({ ...m }));
    const recentConflicts = game.recentConflicts.map((c) => ({ ...c }));

    // Active orders per player. Cheap to serialize because orderBudget
    // caps the total at ~maxPlayers × orderBudget (a couple dozen at
    // most). The renderer paints these as brush strokes in
    // drawOrders(); strategy code on the client doesn't run, so the
    // order's `commitment` tag is purely visual.
    const orders = [];
    const playersList = game.players.list;
    for (let i = 0; i < playersList.length; i++) {
      const p = playersList[i];
      const arr = p.orders;
      if (!arr || arr.length === 0) continue;
      for (let j = 0; j < arr.length; j++) {
        const o = arr[j];
        orders.push({
          id: o.id,
          playerId: o.playerId,
          kind: o.kind,
          region: { x: o.region.x, y: o.region.y, w: o.region.w, h: o.region.h },
          vector: { dx: o.vector.dx, dy: o.vector.dy },
          intensity: o.intensity,
          ttl: o.ttl,
          commitment: o.commitment,
          birthTick: o.birthTick,
        });
      }
    }

    // Strategy-overlay plan caches. Only included when the client has
    // toggled overlay on; otherwise we'd ship ~4 bytes/tile/player every
    // snapshot for nothing. Each plan owns three typed arrays sized by
    // the map; structured-clone copies them across the boundary.
    let plans = null;
    if (this._overlayEnabled) {
      plans = [];
      const list = game.players.list;
      for (let i = 0; i < list.length; i++) {
        const pid = list[i].id;
        for (const prefix of PLAN_PREFIXES) {
          const cached = game[`${prefix}${pid}`];
          if (!cached || cached.tick !== game.tick) continue;
          const p = cached.plan;
          plans.push({
            playerId: pid,
            prefix,
            tick: cached.tick,
            roles: p.roles,
            depth: p.depth,
            friendly: p.friendly,
          });
          break;
        }
      }
    }

    return {
      tick: game.tick,
      elapsed: game.elapsed,
      mapWidth: game.map.width,
      mapHeight: game.map.height,
      mapWrap: game.map.wrap,
      moveFadeTicks: game.moveFadeTicks,
      conflictFadeTicks: game.conflictFadeTicks,
      maxArmy: game.maxArmy,
      armies,
      playerTotals,
      recentMoves,
      recentConflicts,
      orders,
      history,
      plans,
    };
  }
}
