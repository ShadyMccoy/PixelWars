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
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      if (!a.alive) continue;
      const pid = a.player.id;
      let merged = false;
      for (let g = 0; g < groupedPids.length; g++) {
        if (groupedPids[g] === pid) {
          const head = grouped[g];
          // A group is "attacking" if any contributing army arrived this
          // tick as an attacker.
          const wasAttacker = head.isAttacker || a.isAttacker;
          head.joinForces(a);
          head.isAttacker = wasAttacker;
          merged = true;
          break;
        }
      }
      if (!merged) {
        grouped.push(a);
        groupedPids.push(pid);
      }
    }

    // Risk-style: attackers fight with bonus effective strength, so even
    // a slightly-smaller attacker can dislodge a defender, and a
    // larger attacker keeps more troops after a successful conquest.
    const bonus = (grouped[0] && grouped[0].game && grouped[0].game.attackerBonus) || 1;
    const eff = (army) => (army.isAttacker ? army.strength * bonus : army.strength);
    const realLoss = (army, effLoss) => (army.isAttacker ? effLoss / bonus : effLoss);

    let survivor = null;
    for (let i = 0; i < grouped.length; i++) {
      const army = grouped[i];
      if (!army.alive) continue;
      if (!survivor) {
        survivor = army;
        continue;
      }
      const aE = eff(army);
      const sE = eff(survivor);
      if (aE > sE) {
        army.strength -= realLoss(army, sE);
        if (army.strength < 0.5) army.die();
        survivor.die();
        survivor = army.alive ? army : null;
      } else {
        survivor.strength -= realLoss(survivor, aE);
        if (survivor.strength < 0.5) survivor.die();
        army.die();
        if (!survivor.alive) survivor = null;
      }
    }

    if (survivor && survivor.alive) {
      survivor.isAttacker = false;
      this.armies.push(survivor);
      survivor.tile = this;
    }
  }

  ownerArmy() {
    return this.armies.length > 0 ? this.armies[0] : null;
  }

  equals(other) {
    return other && this.pos.equals(other.pos);
  }
}
