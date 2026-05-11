import { GamePos } from "./GamePos.js";

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

    // Defender/attacker is derived from the persisted holder, not from
    // a stale per-army flag. While a campaign is intermingling, the
    // invader keeps the atk multiplier every tick and the defender
    // keeps the def multiplier — the engine has stable, explicit
    // role-tracking based on whose tile this actually is rather than
    // who arrived this tick. With combatModel="lanchester" the global
    // attacker advantage is encoded by the square law instead of a
    // flat per-tick coefficient, so no extra bonus is layered on top.
    const holderPid = this._holderPid;
    const armyMult = (army) => {
      const m = army.player.techMults;
      if (!m) return 1;
      return army.player.id === holderPid ? m.def : m.atk;
    };
    const eff = (army) => army.strength * armyMult(army);

    let engagedStrength = 0;
    for (let i = 0; i < grouped.length; i++) engagedStrength += grouped[i].strength;

    // Staged attrition: each group loses (rate × pressure + floor) of
    // its effective strength per tick. The rate term shapes large
    // fights so two 6v6 stacks resolve over ~5–6 ticks (visible
    // brackish bulge); the floor term ensures small fights snap to
    // near-instant — a 1v1 dies in 1–2 ticks. Pressure is capped at
    // myEff so a tiny outnumbered force can't take impossible losses,
    // and the 0.5 death threshold ends mismatched fights cleanly.
    //
    // Lanchester branch normalizes the rate-term pressure by myEff so
    // a fair 1v1 matches linear at the same k, but a 2x ratio still
    // compounds (~4x damage advantage on the heavier side).
    const k = (game && game.conflictAttritionRate) || 0.15;
    const floorEff = (game && game.conflictAttritionFloor) || 0.5;
    const effs = new Array(grouped.length);
    let totalEff = 0;
    for (let i = 0; i < grouped.length; i++) {
      effs[i] = eff(grouped[i]);
      totalEff += effs[i];
    }

    if (model === "lanchester") {
      let totalEffSq = 0;
      for (let i = 0; i < effs.length; i++) totalEffSq += effs[i] * effs[i];
      for (let i = 0; i < grouped.length; i++) {
        const army = grouped[i];
        const myEff = effs[i];
        const enemyEffSq = totalEffSq - myEff * myEff;
        if (enemyEffSq <= 0) continue;
        const denom = myEff > 0 ? myEff : 1;
        const pressureRaw = Math.min(myEff, enemyEffSq / denom);
        const lossesEff = Math.min(myEff, k * pressureRaw + floorEff);
        army.strength -= lossesEff / armyMult(army);
        if (army.strength < 0.5) army.die();
      }
    } else {
      for (let i = 0; i < grouped.length; i++) {
        const army = grouped[i];
        const myEff = effs[i];
        const enemyEff = totalEff - myEff;
        if (enemyEff <= 0) continue;
        const pressureRaw = Math.min(myEff, enemyEff);
        const lossesEff = Math.min(myEff, k * pressureRaw + floorEff);
        army.strength -= lossesEff / armyMult(army);
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
