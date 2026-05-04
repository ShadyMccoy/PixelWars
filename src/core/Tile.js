import { GamePos } from "./GamePos.js";

export class Tile {
  constructor(pos) {
    this.pos = pos;
    this.armies = [];
    this.neighbors = [null, null, null, null];
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
    const armies = this.armies;
    if (armies.length <= 1) return;

    let survivor = null;
    let survivorPid = 0;
    const grouped = [];
    const groupedPids = [];
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
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
        groupedPids.push(pid);
        grouped.push(a);
      }
    }

    for (let i = 0; i < grouped.length; i++) {
      const army = grouped[i];
      if (!survivor) {
        survivor = army;
        survivorPid = groupedPids[i];
        continue;
      }
      if (army.strength > survivor.strength) {
        army.fight(survivor.strength);
        survivor.die();
        survivor = army;
        survivorPid = groupedPids[i];
      } else {
        survivor.fight(army.strength);
        army.die();
      }
    }

    if (survivor && survivor.alive) {
      armies.length = 1;
      armies[0] = survivor;
    } else {
      armies.length = 0;
      survivorPid = 0;
    }
    return survivorPid;
  }

  ownerArmy() {
    return this.armies.length > 0 ? this.armies[0] : null;
  }

  equals(other) {
    return other && this.pos.equals(other.pos);
  }
}
