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

    // N-way symmetric resolution. Every side simultaneously fights the
    // union of all the others; only the unique strongest can survive.
    //
    //   lanchester (default): post²(i) = e_i² − Σ_{j≠i} e_j².
    //     Comes from the square-law ODE under simultaneous focused
    //     fire from all opponents. Order-independent. Reduces to the
    //     2-way result sqrt(wE² − lE²). Concentration of mass pays
    //     super-linearly, so coalitions out-fight a single larger
    //     side once their summed squares cross.
    //   linear: post(i) = e_i − Σ_{j≠i} e_j.
    //     Additive damage; ganging up is purely cumulative.
    //
    // If no unique top (top-2 tie within ε), all sides annihilate.
    const game = grouped[0] && grouped[0].game;
    const bonus = (game && game.attackerBonus) || 1;
    const model = (game && game.combatModel) || "lanchester";

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
    if (grouped.length === 1) {
      survivor = grouped[0];
    } else if (grouped.length > 1) {
      let totalSq = 0;
      let totalLin = 0;
      let bestIdx = -1;
      let bestE = -Infinity;
      let secondE = -Infinity;
      const effs = new Array(grouped.length);
      for (let i = 0; i < grouped.length; i++) {
        const e = eff(grouped[i]);
        effs[i] = e;
        totalSq += e * e;
        totalLin += e;
        if (e > bestE) {
          secondE = bestE;
          bestE = e;
          bestIdx = i;
        } else if (e > secondE) {
          secondE = e;
        }
      }
      const tied = bestE - secondE < 1e-9;
      if (!tied) {
        const winner = grouped[bestIdx];
        const wMult = armyMult(winner);
        const wE = bestE;
        let postRaw;
        if (model === "lanchester") {
          const sq = wE * wE - (totalSq - wE * wE);
          postRaw = sq > 0 ? Math.sqrt(sq) / wMult : 0;
        } else {
          const lin = wE - (totalLin - wE);
          postRaw = lin > 0 ? lin / wMult : 0;
        }
        winner.strength = postRaw;
        if (winner.strength < 0.5) {
          winner.die();
        } else {
          survivor = winner;
        }
      }
      for (let i = 0; i < grouped.length; i++) {
        if (grouped[i] === survivor) continue;
        if (grouped[i].alive) grouped[i].die();
      }
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
