import { GamePos } from "./GamePos.js";

let nextId = 1;

export class Army {
  constructor({ pos, player, strength, game, maxStrength = 10 }) {
    this.id = nextId++;
    this.pos = pos;
    this.player = player;
    this.strength = strength;
    this.maxStrength = maxStrength;
    this.game = game;
    this.alive = true;
    this.lastTick = 0;
    this.bornAt = performance.now();
  }

  fight(amount) {
    this.strength -= amount;
    if (this.strength < 0.5) this.die();
  }

  joinForces(other) {
    this.strength += other.strength;
    if (this.strength > this.maxStrength) this.strength = this.maxStrength;
    other.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    const tile = this.game.map.getTileFromPos(this.pos);
    if (tile) tile.removeArmy(this);
    this.game.removeArmy(this);
  }

  isAttackValid(tile, power) {
    if (!tile) return false;
    if (this.pos.equals(tile.pos)) return false;
    if (power <= 0.5) return false;
    if (this.strength - power < 1) return false;
    return true;
  }

  attack(tile, power) {
    if (!this.isAttackValid(tile, power)) return false;
    this.strength -= power;
    const newArmy = new Army({
      pos: tile.pos,
      player: this.player,
      strength: power,
      game: this.game,
      maxStrength: this.maxStrength,
    });
    this.game.spawnArmy(newArmy, tile);
    return true;
  }

  run(interval, growth) {
    this.strength += interval * growth;
    if (this.strength > this.maxStrength) this.strength = this.maxStrength;
    this.player.strategy(this, this.game);
  }

  weakestAdjacent(gradient = [0, 0, 0, 0]) {
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = this.game.map.adjacent(this.pos, i);
      if (!t) continue;
      const score = sumStrength(t.armies, this.player) - gradient[i];
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }
}

export function sumStrength(armies, viewer) {
  let s = 0;
  if (!viewer) {
    for (const a of armies) s += a.strength;
    return s;
  }
  for (const a of armies) {
    if (a.player.equals(viewer)) s += a.strength;
    else s -= a.strength;
  }
  return s;
}

export function totalStrength(armies) {
  let s = 0;
  for (const a of armies) s += a.strength;
  return s;
}
