import { GamePos } from "./GamePos.js";
import { cellInRegion, WALL_DEF_SCALE } from "./Order.js";

export class Tile {
  constructor(pos) {
    this.pos = pos;
    this.armies = [];
    this.neighbors = [null, null, null, null];
    this.stencil5 = null;
    this.lastOwner = null;
    this.ownership = 0;
    this.ownerId = 0;
    this.dirty = false;
    // Per-tile movement budget in work units (strength × distance).
    // Recharges per tick (modulated by owner's move-tech multiplier),
    // is clamped on use (min of requested work and available budget),
    // and resets to 0 when the tile changes hands. Only consulted in
    // "budget" movement mode; classic mode ignores it.
    this.budget = 0;
    // Sticky holder id: the player who "controls" this tile across
    // ticks. Null while the tile is neutral or contested-in-flux. Only
    // flips when one side has cleared the tile, or when the prior
    // holder loses their last army on it. Contested tiles where the
    // prior holder still has an army keep their _holderPid — that
    // lets territory tint and territory totals stay stable while a
    // campaign bulges in and evaporates, instead of strobing whenever
    // an attacker briefly out-effectives the defender.
    this._holderPid = null;
  }

  registerArmy(army) {
    this.armies.push(army);
  }

  removeArmy(army) {
    const arr = this.armies;
    const i = arr.indexOf(army);
    if (i < 0) return;
    const last = arr.length - 1;
    if (i !== last) arr[i] = arr[last];
    arr.length = last;
  }

  resolveConflicts() {
    const all = this.armies;
    if (all.length <= 1) return;

    // Detach the live list so joinForces/die -> tile.removeArmy can't
    // truncate the array we are iterating. The dying armies will try to
    // remove themselves from this.armies (now empty) which is a noop;
    // the engine still sees them die via game.removeArmy.
    const list = all.slice();
    this.armies = [];

    const grouped = [];
    const groupedPids = [];
    // Group friendlies on this tile into one army per player. The
    // engine invariant (at most one alive army per player per tile)
    // means duplicates only arise when an attack synthesizes a new
    // army at the destination while a friendly is already there —
    // joinForces folds them. With the sticky-holder model we don't
    // need to track per-army attacker status during grouping; role
    // is derived from tile holder below.
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      if (!a.alive) continue;
      const pid = a.player.id;
      let merged = false;
      for (let g = 0; g < groupedPids.length; g++) {
        if (groupedPids[g] === pid) {
          grouped[g].joinForces(a);
          merged = true;
          break;
        }
      }
      if (!merged) {
        grouped.push(a);
        groupedPids.push(pid);
      }
    }

    const game = grouped[0] && grouped[0].game;
    const model = (game && game.combatModel) || "lanchester";

    // Single-player tile after friendly merging: no combat, place the
    // survivor and exit. Common path for reinforcement-on-friend.
    if (grouped.length === 1) {
      const survivor = grouped[0];
      if (survivor.alive) {
        survivor.tile = this;
        this.armies.push(survivor);
      }
      return;
    }

    // Combat math:
    //  - pressure is computed on raw strength (lanchester square law
    //    encodes "concentrating force wins decisively" without any
    //    role-based effective-strength fudging).
    //  - tech.atk is "causing losses" — multiplies the damage I deal.
    //  - tech.def is "taking losses" — divides the damage I receive.
    //    Both apply symmetrically regardless of whether I'm holding
    //    the tile or invading it; the structural defender advantage
    //    comes from the sticky holder mechanic, not from doubling up
    //    bonuses on the army that happens to be on its home tile.
    const atkOf = (army) => army.player.techMults?.atk ?? 1;
    // Defensive multiplier picks up a bonus when the army is on a
    // tile covered by its owner's wall stratagem(s). Each wall
    // contributes intensity × WALL_DEF_SCALE (default 0.5), and walls
    // of the same player stack additively — a fortress with three
    // overlapping intensity-1 walls gives +150% def. Walls of an
    // enemy player do nothing for this army.
    const mapW = game?.map?.width;
    const mapH = game?.map?.height;
    const tx = this.pos.x;
    const ty = this.pos.y;
    const defOf = (army) => {
      const base = army.player.techMults?.def ?? 1;
      const orders = army.player.orders;
      if (!orders || orders.length === 0) return base;
      let wallBonus = 0;
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i];
        if (o.kind !== "wall") continue;
        if (cellInRegion(tx, ty, o.region, mapW, mapH)) {
          wallBonus += o.intensity * WALL_DEF_SCALE;
        }
      }
      return base * (1 + wallBonus);
    };

    let engagedStrength = 0;
    for (let i = 0; i < grouped.length; i++) engagedStrength += grouped[i].strength;

    // Staged attrition: base per-tick loss is (rate × pressure + floor)
    // in raw-strength units, then scaled by enemy "causing losses"
    // (averaged across enemies, weighted by their strength share) and
    // divided by my "taking losses". A fair 6v6 between neutral-tech
    // sides resolves in roughly 6/(rate*6 + floor) ≈ 6/0.86 ≈ 7 ticks
    // at the default rate=0.06; small fights still snap because the
    // floor dominates relative to the small stack. Pressure is capped
    // at my own strength so a tiny outnumbered force can't take
    // impossible losses; the 0.5 death threshold ends mismatched
    // fights cleanly.
    //
    // Lanchester branch normalizes the rate-term pressure by myStr so
    // a fair 1v1 matches linear at the same rate, but a 2x ratio
    // compounds (~4x damage advantage on the heavier side).
    const k = (game && game.attritionRate) || 0.06;
    const floorRaw = (game && game.attritionFloor) || 0.5;
    const strs = new Array(grouped.length);
    let totalStr = 0;
    for (let i = 0; i < grouped.length; i++) {
      strs[i] = grouped[i].strength;
      totalStr += strs[i];
    }

    if (model === "lanchester") {
      let totalStrSq = 0;
      for (let i = 0; i < strs.length; i++) totalStrSq += strs[i] * strs[i];
      for (let i = 0; i < grouped.length; i++) {
        const army = grouped[i];
        const myStr = strs[i];
        const enemyStrSq = totalStrSq - myStr * myStr;
        if (enemyStrSq <= 0) continue;
        const denom = myStr > 0 ? myStr : 1;
        const pressure = Math.min(myStr, enemyStrSq / denom);
        const base = Math.min(myStr, k * pressure + floorRaw);
        let enemyAtkSum = 0;
        let enemyStrSum = 0;
        for (let j = 0; j < grouped.length; j++) {
          if (j === i) continue;
          enemyAtkSum += strs[j] * atkOf(grouped[j]);
          enemyStrSum += strs[j];
        }
        const avgEnemyAtk = enemyStrSum > 0 ? enemyAtkSum / enemyStrSum : 1;
        army.strength -= base * avgEnemyAtk / defOf(army);
        if (army.strength < 0.5) army.die();
      }
    } else {
      for (let i = 0; i < grouped.length; i++) {
        const army = grouped[i];
        const myStr = strs[i];
        const enemyStr = totalStr - myStr;
        if (enemyStr <= 0) continue;
        const pressure = Math.min(myStr, enemyStr);
        const base = Math.min(myStr, k * pressure + floorRaw);
        let enemyAtkSum = 0;
        let enemyStrSum = 0;
        for (let j = 0; j < grouped.length; j++) {
          if (j === i) continue;
          enemyAtkSum += strs[j] * atkOf(grouped[j]);
          enemyStrSum += strs[j];
        }
        const avgEnemyAtk = enemyStrSum > 0 ? enemyAtkSum / enemyStrSum : 1;
        army.strength -= base * avgEnemyAtk / defOf(army);
        if (army.strength < 0.5) army.die();
      }
    }

    // Re-place survivors. Multiple groups may persist on the tile while
    // the fight continues; GameMap.resolveConflicts re-queues this tile
    // for the next tick whenever it stays contested. Sort descending so
    // armies[0] is the strongest occupant — useful for legacy reads,
    // even though ownerArmy() now keys off _holderPid.
    const survivors = [];
    for (let i = 0; i < grouped.length; i++) {
      if (grouped[i].alive) survivors.push(grouped[i]);
    }
    survivors.sort((a, b) => b.strength - a.strength);

    for (let i = 0; i < survivors.length; i++) {
      const a = survivors[i];
      a.tile = this;
      this.armies.push(a);
    }

    // Sticky-holder update. _holderPid was seeded on the tile's first
    // occupation (Game.spawnArmy), so the prior-holder lookup is just
    // a state read; no need for a per-tick fallback. The tile flips
    // only when the prior holder has no army left on it. When the
    // remaining survivors are multiple non-holders (e.g., two
    // attackers contesting after the defender fell), the tile is in
    // flux — no holder until one side clears it.
    const aliveByPid = new Set();
    for (let i = 0; i < survivors.length; i++) aliveByPid.add(survivors[i].player.id);
    const priorHolder = this._holderPid;
    let nextHolder;
    if (aliveByPid.size === 0) {
      nextHolder = priorHolder;
    } else if (aliveByPid.size === 1) {
      nextHolder = survivors[0].player.id;
    } else if (priorHolder != null && aliveByPid.has(priorHolder)) {
      nextHolder = priorHolder;
    } else {
      nextHolder = null;
    }
    if (nextHolder !== priorHolder) this.budget = 0;
    this._holderPid = nextHolder;

    if (engagedStrength > 0 && game && game.recordConflict) {
      game.recordConflict(this, engagedStrength);
    }
  }

  ownerArmy() {
    if (this._holderPid == null) return null;
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      if (armies[i].player.id === this._holderPid) return armies[i];
    }
    // Holder is recorded but has no army on the tile right now — either
    // their army was just killed in a contested tick, or the tile is
    // empty post-mutual-annihilation. Reads as in-flux / neutral:
    // territory totals don't credit anyone, renderer paints brackish.
    return null;
  }

  // True iff multiple distinct players have alive armies on this tile.
  // Used by the renderer to paint brackish tiles and by GameMap to
  // re-queue contested tiles for next tick's combat pass.
  isContested() {
    const armies = this.armies;
    if (armies.length < 2) return false;
    const first = armies[0].player.id;
    for (let i = 1; i < armies.length; i++) {
      if (armies[i].player.id !== first) return true;
    }
    return false;
  }

  equals(other) {
    return other && this.pos.equals(other.pos);
  }
}
