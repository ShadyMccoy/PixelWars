// Browser-side proxy for the engine. Spawns the worker, posts setup
// and control messages, receives snapshots and dispatches them onto a
// GameView that the renderer / HUD / charts read.
//
// This module is the *only* thing on the client side that knows the
// engine boundary exists. Everything downstream (Renderer, HUD,
// StatsChart, TerritoryChart, tooltip code in main.js) reads
// `client.game` as if it were the live engine - same shapes, same
// fields, same `on(...)` event API. That's deliberate: it lets the
// engine evolve independently as long as the snapshot contract holds.

import { GameView } from "./GameView.js";
import {
  MSG_INIT_CUSTOM,
  MSG_INIT_REPLAY,
  MSG_RESET,
  MSG_SET_PLAYING,
  MSG_SET_SPEED,
  MSG_STEP_ONCE,
  MSG_SET_SNAPSHOT_INTERVAL,
  MSG_SET_OVERLAY,
  EVT_SNAPSHOT,
  EVT_PLAYERS_CHANGED,
  EVT_WINNER,
  EVT_DRAW,
  EVT_LOG,
  EVT_READY,
} from "../engine/protocol.js";

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
  { color: "#ffe066", accent: "#fff3a3" },
  { color: "#7cffb2", accent: "#bbffd6" },
];

export class EngineClient {
  constructor() {
    this.game = new GameView();
    this.worker = new Worker(new URL("../engine/worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", (e) => this._onMessage(e.data));
    this._listeners = new Map();
    this._ready = false;
    this._pendingInit = null;
  }

  on(event, fn) {
    let arr = this._listeners.get(event);
    if (!arr) {
      arr = [];
      this._listeners.set(event, arr);
    }
    arr.push(fn);
  }

  emit(event, payload) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    for (const fn of arr) fn(payload);
  }

  // ------------------------------------------------------------------
  // Lifecycle. The client side preallocates the GameView's map / players
  // synchronously so the renderer can size and the HUD can lay out
  // before the first snapshot arrives.
  // ------------------------------------------------------------------

  loadCustom({ mapConfig, lineupStrategies, startPositions, seed }) {
    const palette = PALETTE.slice(0, lineupStrategies.length);
    const lineup = lineupStrategies.map((s) => s.name);
    this._primeView({
      mapConfig,
      strategies: lineupStrategies,
      palette,
      techPerSlot: lineupStrategies.map((s) => s.tech ?? null),
    });
    this._send(MSG_INIT_CUSTOM, {
      mapConfig,
      lineup,
      palette,
      startPositions,
      seed,
    });
  }

  loadReplay({ mapConfig, seed, lineupStrategies, lineupTech, startPositions }) {
    const palette = PALETTE.slice(0, lineupStrategies.length);
    const lineup = lineupStrategies.map((s) => s.name);
    this._primeView({
      mapConfig,
      strategies: lineupStrategies,
      palette,
      techPerSlot: lineupTech ?? lineupStrategies.map((s) => s.tech ?? null),
    });
    this._send(MSG_INIT_REPLAY, {
      mapConfig,
      seed,
      lineup,
      lineupTech: lineupTech ?? null,
      startPositions,
      palette,
    });
  }

  reset() {
    this._send(MSG_RESET, null);
  }

  setPlaying(playing) {
    this._send(MSG_SET_PLAYING, !!playing);
  }

  setSpeed(speed) {
    this._send(MSG_SET_SPEED, speed);
  }

  stepOnce() {
    this._send(MSG_STEP_ONCE, null);
  }

  setSnapshotInterval(ms) {
    this._send(MSG_SET_SNAPSHOT_INTERVAL, ms);
  }

  setOverlay(enabled) {
    this._send(MSG_SET_OVERLAY, !!enabled);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  _send(type, payload) {
    this.worker.postMessage({ type, payload });
  }

  _onMessage(msg) {
    const { type, payload } = msg || {};
    switch (type) {
      case EVT_READY:
        this._ready = true;
        this.emit("ready", null);
        break;
      case EVT_SNAPSHOT:
        this.game.applySnapshot(payload);
        this.emit("snapshot", payload);
        break;
      case EVT_PLAYERS_CHANGED:
        this.game.applyPlayers(payload.players);
        this.emit("players:changed", payload);
        break;
      case EVT_WINNER:
        this.emit("winner", payload);
        break;
      case EVT_DRAW:
        this.emit("draw", payload);
        break;
      case EVT_LOG:
        this.emit("log", payload);
        break;
    }
  }

  // Pre-fill the GameView with map dimensions and player metadata so
  // the renderer / HUD have something to draw against before the
  // first snapshot returns from the worker. Strategy objects on the
  // main side carry the description / summary; we send only the name
  // across the wire and reconstruct the rich metadata locally so the
  // tooltip works without a worker round-trip.
  _primeView({ mapConfig, strategies, palette, techPerSlot }) {
    this.game.applyMap(mapConfig.width, mapConfig.height, !!mapConfig.wrap);
    const players = strategies.map((s, i) => {
      const p = palette[i % palette.length];
      const tech = techPerSlot[i] ?? s.tech ?? null;
      return {
        // Local placeholder ids - the engine will issue real ones in
        // the first players:changed event. Until then, the HUD reads
        // these and gets correct names/colors/strategy info.
        id: -(i + 1),
        name: `${s.name}#${i + 1}`,
        color: p.color,
        accent: p.accent,
        strategy: {
          name: s.name ?? null,
          summary: s.summary ?? null,
          description: s.description ?? null,
        },
        tech: tech ? { ...tech } : null,
        techMults: null,
        totals: { strength: 0, territory: 0, armies: 0 },
      };
    });
    this.game.applyPlayers(players);
  }
}
