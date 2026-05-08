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
    // Movement is rate-limited: act() runs once per accumulated credit,
    // not once per tick. Credit ticks up at the production rate
    // (growth × prodMult × interval), so movement frequency stays in
    // proportion to growth no matter how the game-level rate is set —
    // changing growth scales production AND movement together instead
    // of just shifting the production:logistics ratio. Initialized
    // off the seeded rng so armies don't all fire on the same tick.
    this.moveCredit = game && game.rng ? game.rng() : 0;
  }

  // Maximum strength this army can commit to a single attack while
  // still satisfying its player's tech-derived garrison floor. All
  // strategies should reach for attackPower instead of `strength - 1`
  // so the floor scales with the move tech automatically.
  //
  // In "budget" movementModel the garrison floor is gone; the engine
  // only enforces a minimum 0.5 left behind so the source tile doesn't
  // pop empty mid-tick. Bots can throw more strength forward, but the
  // per-tile budget will clamp how much actually arrives.
  get attackPower() {
    const floor = this.game?.movementModel === "budget"
      ? 0.5
      : (this.player.minGarrison ?? 1);
    const v = this.strength - floor;
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

  // Wrap-aware Euclidean distance from src to dst, in tiles. Used as
  // the work multiplier for movement budget in "budget" mode.
  _distance(src, dst) {
    const w = this.game.map.width;
    const h = this.game.map.height;
    let dx = dst.pos.x - src.pos.x;
    let dy = dst.pos.y - src.pos.y;
    if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
    if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
    return Math.sqrt(dx * dx + dy * dy);
  }

  attack(tile, power) {
    // Budget movement model: the bot can ask for any (non-self) tile.
    // Cost formula has a flat per-move overhead: cost = power *
    // distance + 1. The +1 is a fixed fee per move regardless of
    // distance, so many small moves are strictly more expensive
    // than fewer larger moves carrying the same total power. Engine
    // clamps actual delivered power to whatever the source tile's
    // budget can pay for; conquest of the destination resets *its*
    // budget to 0 in resolveConflicts.
    if (this.game.movementModel === "budget") {
      if (!tile || this.tile === tile) return false;
      if (power <= 0.5) return false;
      const src = this.tile;
      if (!src) return false;
      const dist = this._distance(src, tile);
      if (dist <= 0) return false;
      // cost = power * distance + 1. Solve actualPower from clamped
      // actualWork: actualPower = (actualWork - 1) / dist.
      const requestedWork = power * dist + 1;
      const budget = src.budget;
      const actualWork = requestedWork < budget ? requestedWork : budget;
      const actualPower = (actualWork - 1) / dist;
      if (actualPower <= 0.5) return false;
      // Engine sanity: keep at least 0.5 strength behind so the
      // source tile doesn't pop empty mid-tick. Lower bound; the
      // garrison floor is otherwise gone in budget mode.
      if (this.strength - actualPower < 0.5) return false;
      src.budget = budget - actualWork;
      this.game.recordMove(src, tile, this.player, actualPower);
      this.strength -= actualPower;
      const pid = this.player.id;
      const existing = tile.armies;
      for (let i = 0; i < existing.length; i++) {
        const other = existing[i];
        if (other.alive && other.player.id === pid) {
          let s = other.strength + actualPower;
          const max = other.maxStrength;
          if (s > max) s = max;
          other.strength = s;
          return true;
        }
      }
      const newArmy = new Army({
        pos: tile.pos,
        player: this.player,
        strength: actualPower,
        game: this.game,
        maxStrength: this.game.maxArmy,
        tile,
      });
      newArmy.isAttacker = true;
      this.game.spawnArmy(newArmy, tile);
      return true;
    }
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
    // Accumulate move credit at the production rate, but cap at 8 so an
    // idle backfield army banks enough for a real burst when an opening
    // appears — without growing an unbounded stockpile over a long match.
    // Credit is then burned in a loop so the burst lands in one tick
    // instead of drip-feeding one move per growth-period.
    let credit = this.moveCredit + interval * growth * prodMult;
    if (credit > 8) credit = 8;
    this.moveCredit = credit;
    if (credit < 1) return;
    const actFn = typeof strat === "function" ? strat : strat.act;
    if (typeof actFn !== "function") return;
    while (this.moveCredit >= 1 && this.alive) {
      this.moveCredit -= 1;
      actFn(this, this.game);
    }
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
