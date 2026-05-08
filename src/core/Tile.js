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
    // Identify the previous holder (army that was already on the tile,
    // not arrived this tick) for conquest detection. If no
    // non-attacker is present the tile was effectively neutral.
    let prevHolderPid = null;
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      if (!a.alive) continue;
      const pid = a.player.id;
      if (!a.isAttacker && prevHolderPid === null) prevHolderPid = pid;
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

    // Risk-style: attackers fight with bonus effective strength, so
    // even a slightly-smaller attacker can dislodge a defender, and a
    // larger attacker keeps more troops after a successful conquest.
    // Per-player tech further multiplies: atkMult on attackers,
    // defMult on defenders.
    //
    // Two combat models, switched at the Game level:
    //   linear (default): winner's post-fight raw strength is
    //     (wE - lE) / wMult — flat subtractive, overkill earns
    //     nothing nonlinear, equal effective forces annihilate.
    //   lanchester: winner's post-fight effective strength is
    //     sqrt(wE^2 - lE^2). A 2x ratio is ~4x more efficient than
    //     a 1.01x ratio, so concentrating mass at a breakthrough
    //     pays compounding dividends. Bots tuned on linear (e.g.
    //     Conqueror's enemy/1.4 + MARGIN commit math) under-commit
    //     here — closed-form min-overkill becomes a strict
    //     underestimate of the right attack size.
    const game = grouped[0] && grouped[0].game;
    const bonus = (game && game.attackerBonus) || 1;
    const model = (game && game.combatModel) || "linear";

    // Total strength engaged across all sides — fed to the renderer as
    // conflict magnitude so the red residue scales with fight size.
    // Only meaningful when at least two distinct players collided here;
    // single-player merges are not conflicts.
    let engagedStrength = 0;
    if (grouped.length > 1) {
      for (let i = 0; i < grouped.length; i++) engagedStrength += grouped[i].strength;
    }
    const armyMult = (army) => {
      const m = army.player.techMults;
      if (army.isAttacker) return bonus * (m ? m.atk : 1);
      return m ? m.def : 1;
    };
    const eff = (army) => army.strength * armyMult(army);

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
      const winner = aE >= sE ? army : survivor;
      const loser = aE >= sE ? survivor : army;
      const wE = aE >= sE ? aE : sE;
      const lE = aE >= sE ? sE : aE;
      let postRaw;
      if (model === "lanchester") {
        const sq = wE * wE - lE * lE;
        postRaw = sq > 0 ? Math.sqrt(sq) / armyMult(winner) : 0;
      } else {
        postRaw = wE > lE ? (wE - lE) / armyMult(winner) : 0;
      }
      winner.strength = postRaw;
      if (winner.strength < 0.5) winner.die();
      loser.die();
      survivor = winner.alive ? winner : null;
    }

    // Conquest reset: if ownership of the tile changes (or the tile
    // empties out entirely), zero the per-tile movement budget. Only
    // meaningful in "budget" movement mode; otherwise it's a no-op.
    const newPid = survivor && survivor.alive ? survivor.player.id : null;
    if (newPid !== prevHolderPid) this.budget = 0;

    if (survivor && survivor.alive) {
      survivor.isAttacker = false;
      this.armies.push(survivor);
      survivor.tile = this;
    }

    if (engagedStrength > 0 && game && game.recordConflict) {
      game.recordConflict(this, engagedStrength);
    }
  }

  ownerArmy() {
    return this.armies.length > 0 ? this.armies[0] : null;
  }

  equals(other) {
    return other && this.pos.equals(other.pos);
  }
}
