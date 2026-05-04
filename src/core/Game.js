import { GameMap } from "./GameMap.js";
import { Army } from "./Army.js";
import { Players } from "./Player.js";

export class Game {
  constructor({ width = 40, height = 30, wrap = true, growth = 1, maxArmy = 10 } = {}) {
    this.map = new GameMap({ width, height, wrap });
    this.players = new Players();
    this.armies = new Set();
    this.tick = 0;
    this.elapsed = 0;
    this.growth = growth;
    this.maxArmy = maxArmy;
    this.history = [];
    this.maxHistory = 240;
    this.eventBus = new EventTarget();
  }

  on(event, fn) {
    this.eventBus.addEventListener(event, fn);
  }

  emit(event, detail) {
    this.eventBus.dispatchEvent(new CustomEvent(event, { detail }));
  }

  addPlayer(player) {
    this.players.add(player);
    this.emit("players:changed", { players: this.players.list });
    return player;
  }

  removePlayer(player) {
    for (const a of [...this.armies]) {
      if (a.player.equals(player)) a.die();
    }
    this.players.remove(player);
    this.emit("players:changed", { players: this.players.list });
  }

  spawnArmy(army, tile) {
    this.armies.add(army);
    tile.registerArmy(army);
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
    });
    this.spawnArmy(army, tile);
    return army;
  }

  removeArmy(army) {
    this.armies.delete(army);
  }

  step(interval) {
    this.tick++;
    this.elapsed += interval;
    for (const a of this.armies) {
      if (!a.alive) continue;
      if (a.lastTick < this.tick) {
        a.run(interval, this.growth);
        a.lastTick = this.tick;
      }
    }
    this.map.resolveConflicts();
    this.recomputeTotals();
    this.recordHistory();
  }

  recomputeTotals() {
    this.players.resetTotals();
    for (const a of this.armies) {
      if (!a.alive) continue;
      const t = a.player.totals;
      t.armies++;
      t.strength += a.strength;
    }
    for (const t of this.map.tiles) {
      const owner = t.ownerArmy()?.player;
      if (owner) owner.totals.territory++;
    }
  }

  recordHistory() {
    const sample = { t: this.elapsed };
    for (const p of this.players.list) {
      sample[p.id] = p.totals.strength;
    }
    this.history.push(sample);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  reset() {
    for (const a of [...this.armies]) a.die();
    this.armies.clear();
    this.tick = 0;
    this.elapsed = 0;
    this.history.length = 0;
    for (const t of this.map.tiles) t.armies.length = 0;
  }

  livingPlayers() {
    return this.players.list.filter((p) => p.totals.armies > 0);
  }
}
