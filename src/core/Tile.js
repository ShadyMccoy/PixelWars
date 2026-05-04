import { GamePos } from "./GamePos.js";

export class Tile {
  constructor(pos) {
    this.pos = pos;
    this.armies = [];
    this.lastOwner = null;
    this.ownership = 0;
  }

  registerArmy(army) {
    this.armies.push(army);
  }

  removeArmy(army) {
    const i = this.armies.indexOf(army);
    if (i >= 0) this.armies.splice(i, 1);
  }

  resolveConflicts() {
    if (this.armies.length <= 1) return;

    const grouped = new Map();
    for (const a of this.armies) {
      const key = a.player.id;
      const existing = grouped.get(key);
      if (existing) existing.joinForces(a);
      else grouped.set(key, a);
    }

    let survivor = null;
    for (const army of grouped.values()) {
      if (!survivor) {
        survivor = army;
        continue;
      }
      if (army.strength > survivor.strength) {
        army.fight(survivor.strength);
        survivor.die();
        survivor = army;
      } else {
        survivor.fight(army.strength);
        army.die();
      }
    }

    this.armies = survivor && survivor.alive ? [survivor] : [];
  }

  ownerArmy() {
    return this.armies[0] ?? null;
  }

  equals(other) {
    return other && this.pos.equals(other.pos);
  }
}
