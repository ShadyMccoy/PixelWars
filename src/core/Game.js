import { GameMap } from "./GameMap.js";
import { Army } from "./Army.js";
import { Players } from "./Player.js";
import { makeRng } from "./rng.js";

export class Game {
  constructor({
    width = 40,
    height = 30,
    wrap = true,
    growth = 1,
    maxArmy = 10,
    maxHistory = 240,
    seed = null,
  } = {}) {
    this.map = new GameMap({ width, height, wrap });
    this.players = new Players();
    this.armies = [];
    this._deadCount = 0;
    this._dirtyTiles = [];
    this.tick = 0;
    this.elapsed = 0;
    this.growth = growth;
    this.maxArmy = maxArmy;
    this.history = [];
    this.maxHistory = maxHistory;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.eventBus = typeof EventTarget !== "undefined" ? new EventTarget() : null;
    this._territoryDirty = true;
  }

  on(event, fn) {
    this.eventBus?.addEventListener(event, fn);
  }

  emit(event, detail) {
    if (!this.eventBus || typeof CustomEvent === "undefined") return;
    this.eventBus.dispatchEvent(new CustomEvent(event, { detail }));
  }

  addPlayer(player) {
    this.players.add(player);
    this.emit("players:changed", { players: this.players.list });
    return player;
  }

  removePlayer(player) {
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (a.alive && a.player.equals(player)) a.die();
    }
    this.players.remove(player);
    this.emit("players:changed", { players: this.players.list });
  }

  spawnArmy(army, tile) {
    // Engine invariant: at most one alive army per (tile, player). If a
    // friendly already holds the tile, fold strength into it rather than
    // adding a duplicate. Keeps tile.armies bounded by player count and
    // prevents Trinity-style stacking regardless of strategy choice.
    const existing = tile.armies;
    const pid = army.player.id;
    for (let i = 0; i < existing.length; i++) {
      const other = existing[i];
      if (other.alive && other.player.id === pid) {
        let s = other.strength + army.strength;
        const max = other.maxStrength;
        if (s > max) s = max;
        other.strength = s;
        army.alive = false;
        army.tile = null;
        this._territoryDirty = true;
        return other;
      }
    }
    this.armies.push(army);
    army.tile = tile;
    tile.registerArmy(army);
    if (tile.armies.length > 1 && !tile.dirty) {
      tile.dirty = true;
      this._dirtyTiles.push(tile);
    }
    this._territoryDirty = true;
    return army;
  }

  placeArmy({ x, y, player, strength = 1 }) {
    const tile = this.map.getTile(x, y);
    if (!tile) return null;
    const army = new Army({
      pos: tile.pos,
      player,
      strength,
      game: this,
      maxStrength: this.maxArmy,
      tile,
    });
    this.spawnArmy(army, tile);
    return army;
  }

  removeArmy(army) {
    this._deadCount++;
    this._territoryDirty = true;
  }

  step(interval) {
    this.tick++;
    this.elapsed += interval;
    const armies = this.armies;
    const tick = this.tick;
    const growth = this.growth;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive) continue;
      if (a.lastTick < tick) {
        a.run(interval, growth);
        a.lastTick = tick;
      }
    }
    this.map.resolveConflicts(this._dirtyTiles);

    if (this._deadCount > 32 && this._deadCount * 4 > armies.length) {
      this._compactArmies();
    }

    this.recomputeStrengthTotals();
    if (this.maxHistory > 0) this.recordHistory();
  }

  stepBatch(count, interval) {
    for (let i = 0; i < count; i++) this.step(interval);
  }

  _compactArmies() {
    const a = this.armies;
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i].alive) a[w++] = a[i];
    }
    a.length = w;
    this._deadCount = 0;
  }

  recomputeStrengthTotals() {
    const list = this.players.list;
    for (let i = 0; i < list.length; i++) {
      const t = list[i].totals;
      t.armies = 0;
      t.strength = 0;
    }
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive) continue;
      const t = a.player.totals;
      t.armies++;
      t.strength += a.strength;
    }
  }

  recomputeTerritory() {
    const list = this.players.list;
    for (let i = 0; i < list.length; i++) list[i].totals.territory = 0;
    const tiles = this.map.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const armies = tiles[i].armies;
      if (armies.length > 0) armies[0].player.totals.territory++;
    }
    this._territoryDirty = false;
  }

  recomputeTotals() {
    this.recomputeStrengthTotals();
    this.recomputeTerritory();
  }

  recordHistory() {
    const sample = { t: this.elapsed };
    const list = this.players.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      sample[p.id] = p.totals.strength;
    }
    this.history.push(sample);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  reset() {
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (a.alive) a.die();
    }
    this.armies.length = 0;
    this._deadCount = 0;
    this._dirtyTiles.length = 0;
    this.tick = 0;
    this.elapsed = 0;
    this.history.length = 0;
    const tiles = this.map.tiles;
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].armies.length = 0;
      tiles[i].dirty = false;
    }
    this._territoryDirty = true;
  }

  livingPlayers() {
    return this.players.list.filter((p) => p.totals.armies > 0);
  }
}
