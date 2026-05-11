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
    this.lastTick = 0;
    this.bornAt = 0;
    // Movement is rate-limited: act() runs at most once per tick, only
    // when accumulated credit ≥ 1. Credit ticks up at the production
    // rate (growth × prodMult × interval), so movement frequency stays
    // in proportion to growth — changing growth scales production AND
    // movement together instead of just shifting the production:logistics
    // ratio. Initialized off the seeded rng so armies don't all fire on
    // the same tick.
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
  //
  // Subtracts strength already queued by earlier attack() calls in the
  // same tick so a strategy that fires twice can't request more than
  // it actually has. Other armies' moves are NOT visible.
  get attackPower() {
    const floor = this.game?.movementModel === "budget"
      ? 0.5
      : (this.player.minGarrison ?? 1);
    const v = this.strength - (this._queuedSpend || 0) - floor;
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
    // Simultaneous-resolution: attack() queues a move into game._pendingMoves
    // and validates it against start-of-tick state. No mutation of strength,
    // budgets, or tile.armies happens here -- Game.step commits all queued
    // moves after every army's act() has run, so bots never see each others'
    // moves in flight. _queuedSpend / _queuedWork track cumulative requests
    // by THIS army within the same tick so successive attack() calls can't
    // overdraw the army's own strength or its source-tile budget.
    if (!tile || this.tile === tile) return false;
    if (power <= 0.5) return false;
    const src = this.tile;
    if (!src) return false;

    if (this.game.movementModel === "budget") {
      const dist = this._distance(src, tile);
      if (dist <= 0) return false;
      // cost = power * distance + 1. Solve actualPower from clamped
      // actualWork: actualPower = (actualWork - 1) / dist. Budget is
      // shared with any earlier queued moves from the same source tile
      // this tick (only this army can hold the tile, so _queuedWork
      // captures all draws against src.budget).
      const requestedWork = power * dist + 1;
      const remainingBudget = src.budget - (this._queuedWork || 0);
      const actualWork = requestedWork < remainingBudget ? requestedWork : remainingBudget;
      const actualPower = (actualWork - 1) / dist;
      if (actualPower <= 0.5) return false;
      // Engine sanity: keep at least 0.5 strength behind so the
      // source tile doesn't pop empty when the move commits.
      if (this.strength - (this._queuedSpend || 0) - actualPower < 0.5) return false;
      this._queuedSpend = (this._queuedSpend || 0) + actualPower;
      this._queuedWork = (this._queuedWork || 0) + actualWork;
      this.game._pendingMoves.push({
        army: this,
        srcTile: src,
        destTile: tile,
        power: actualPower,
        work: actualWork,
      });
      this.game.recordMove(src, tile, this.player, actualPower);
      return true;
    }

    // Classic mode: garrison floor enforced by minGarrison.
    const garrison = this.player.minGarrison ?? 1;
    if (this.strength - (this._queuedSpend || 0) - power < garrison) return false;
    this._queuedSpend = (this._queuedSpend || 0) + power;
    this.game._pendingMoves.push({
      army: this,
      srcTile: src,
      destTile: tile,
      power,
    });
    this.game.recordMove(src, tile, this.player, power);
    return true;
  }

  // Grow strength and bank movement credit. Called in the production
  // phase before any army runs act(); does not invoke strategy code.
  runGrowth(interval, growth, decay = 0) {
    const mults = this.player.techMults;
    const prodMult = mults ? mults.prod : 1;
    const cur = this.strength;
    let s = cur + interval * (growth * prodMult - decay * cur);
    const max = this.maxStrength;
    if (s > max) s = max;
    if (s < 0) s = 0;
    this.strength = s;
    let credit = this.moveCredit + interval * growth * prodMult;
    if (credit > 8) credit = 8;
    this.moveCredit = credit;
    this._queuedSpend = 0;
    this._queuedWork = 0;
  }

  canActThisTick() {
    if (!this.alive) return false;
    if (this.moveCredit < 1) return false;
    const strat = this.player.strategy;
    return !!strat;
  }

  // Run the bot's strategy once. Burns one credit. Strategy attack() calls
  // queue moves into game._pendingMoves; nothing about the world has
  // mutated by the time act() returns.
  runAct() {
    const strat = this.player.strategy;
    if (!strat) return;
    const actFn = typeof strat === "function" ? strat : strat.act;
    if (typeof actFn !== "function") return;
    this.moveCredit -= 1;
    actFn(this, this.game);
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
