import { GamePos } from "./GamePos.js";

let nextId = 1;

export class Army {
  constructor({ pos, player, strength, game, maxStrength = 10, tile = null }) {
    this.id = nextId++;
    this.pos = pos;
    this.player = player;
    this.strength = strength;
    // Tech 'stack' multiplies the per-army cap. Apply at construction so
    // every army owned by a player carries the same cap.
    const stackMult = (player && player.techMults && player.techMults.stack) || 1;
    this.maxStrength = maxStrength * stackMult;
    this.game = game;
    this.tile = tile;
    this.alive = true;
    this.isAttacker = false;
    this.lastTick = 0;
    this.bornAt = 0;
  }

  // Maximum strength this army can commit to a single attack while
  // still satisfying its player's tech-derived garrison floor. All
  // strategies should reach for attackPower instead of `strength - 1`
  // so the floor scales with the move tech automatically.
  get attackPower() {
    const garrison = this.player.minGarrison ?? 1;
    const v = this.strength - garrison;
    return v > 0 ? v : 0;
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
    const tile = this.tile || this.game.map.getTileFromPos(this.pos);
    if (tile) tile.removeArmy(this);
    this.tile = null;
    this.game.removeArmy(this);
  }

  isAttackValid(tile, power) {
    if (!tile) return false;
    if (this.tile === tile) return false;
    if (power <= 0.5) return false;
    const garrison = this.player.minGarrison ?? 1;
    if (this.strength - power < garrison) return false;
    return true;
  }

  attack(tile, power) {
    if (!this.isAttackValid(tile, power)) return false;
    this.game.recordMove(this.tile, tile, this.player, power);
    this.strength -= power;
    // Fast-path: if a friendly already holds the target tile, transfer
    // strength directly without allocating a new Army. Mirrors the
    // engine-level invariant in Game.spawnArmy.
    const pid = this.player.id;
    const existing = tile.armies;
    for (let i = 0; i < existing.length; i++) {
      const other = existing[i];
      if (other.alive && other.player.id === pid) {
        let s = other.strength + power;
        const max = other.maxStrength;
        if (s > max) s = max;
        other.strength = s;
        return true;
      }
    }
    // Pass the engine-level base maxArmy here; the Army constructor
    // re-applies the player's stack multiplier. Using this.maxStrength
    // would compound the multiplier on every spawn.
    const newArmy = new Army({
      pos: tile.pos,
      player: this.player,
      strength: power,
      game: this.game,
      maxStrength: this.game.maxArmy,
      tile,
    });
    newArmy.isAttacker = true;
    this.game.spawnArmy(newArmy, tile);
    return true;
  }

  run(interval, growth, decay = 0) {
    const mults = this.player.techMults;
    const prodMult = mults ? mults.prod : 1;
    const cur = this.strength;
    let s = cur + interval * (growth * prodMult - decay * cur);
    const max = this.maxStrength;
    if (s > max) s = max;
    if (s < 0) s = 0;
    this.strength = s;
    const strat = this.player.strategy;
    if (!strat) return;
    if (typeof strat === "function") strat(this, this.game);
    else if (typeof strat.act === "function") strat.act(this, this.game);
  }

  weakestAdjacent(gradient = null) {
    const tile = this.tile;
    if (!tile) return null;
    const neighbors = tile.neighbors;
    const viewer = this.player;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      let score = sumStrength(t.armies, viewer);
      if (gradient) score -= gradient[i];
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
  const n = armies.length;
  if (!viewer) {
    for (let i = 0; i < n; i++) s += armies[i].strength;
    return s;
  }
  const vid = viewer.id;
  for (let i = 0; i < n; i++) {
    const a = armies[i];
    if (a.player.id === vid) s += a.strength;
    else s -= a.strength;
  }
  return s;
}

export function totalStrength(armies) {
  let s = 0;
  const n = armies.length;
  for (let i = 0; i < n; i++) s += armies[i].strength;
  return s;
}
