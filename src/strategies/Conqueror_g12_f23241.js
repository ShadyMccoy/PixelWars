import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// MARGIN tightened from g11's 0.6 to 0.45. Conqueror_g5_897d51 used
// exactly this trick to beat g11 in season #93 seed=21: every fight
// in the band [enemy/1.4 + 0.45, enemy/1.4 + 0.6) becomes a real
// kill instead of a stall. 0.45 still beats float jitter and
// absorbs a small mid-tick reinforcement.
const MARGIN = 0.45;

// Hemisphere term retained from parent g11 (originally g7_efa4e0):
// when adjacent kills tie on direct enemy mass, prefer the side
// with more structural depth behind it - the "wall to puncture"
// rather than an isolated facade.
const BACKING_WEIGHT = 0.4;

// Retake-aware scoring (Conqueror_g6_1cded0, which beat g11 in
// season #93 seed=16). Backup enemies on the target's *other*
// neighbors retake captured tiles next tick; reward friendly
// backup that makes the capture sticky instead.
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;

// Free-retake veto: tightened from g6's 1.8 to 1.5. With
// MARGIN=0.45 the survivor on a captured tile is only
// MARGIN * BONUS = 0.63 (down from 0.84 at MARGIN=0.6), so a
// backup enemy of ~0.9 can already retake at minimum cost. Any
// stack of 1.5+ retakes trivially - skip.
const RETAKE_VETO = 1.5;

// Stencil5 hemispheres for direction d in {W=0,E=1,N=2,S=3}.
const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

// Stencil5 cell -> [primary dir, secondary dir]. W=0, E=1, N=2, S=3.
const DIR_HINTS = (() => {
  const out = new Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dy = i - 2;
      const dx = j - 2;
      if (dx === 0 && dy === 0) { out[i * 5 + j] = [-1, -1]; continue; }
      const horiz = dx < 0 ? 0 : 1;
      const vert = dy < 0 ? 2 : 3;
      let primary, secondary;
      if (Math.abs(dx) > Math.abs(dy)) {
        primary = horiz;
        secondary = dy === 0 ? -1 : vert;
      } else if (Math.abs(dy) > Math.abs(dx)) {
        primary = vert;
        secondary = dx === 0 ? -1 : horiz;
      } else {
        primary = horiz;
        secondary = vert;
      }
      out[i * 5 + j] = [primary, secondary];
    }
  }
  return out;
})();

function tryCommit(army, target, sLimit, pid) {
  const tArmies = target.armies;
  let friendlyArmy = null;
  let enemy = 0;
  for (let k = 0; k < tArmies.length; k++) {
    const a = tArmies[k];
    if (a.player.id === pid) friendlyArmy = a;
    else enemy += a.strength;
  }
  if (enemy > 0) {
    const needed = enemy / BONUS + MARGIN;
    if (needed > sLimit) return false;
    army.attack(target, needed);
    return true;
  }
  if (friendlyArmy) {
    if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) return false;
    const room = friendlyArmy.maxStrength - friendlyArmy.strength;
    const power = Math.min(sLimit, room);
    if (power <= 0.5) return false;
    army.attack(target, power);
    return true;
  }
  army.attack(target, sLimit);
  return true;
}

// Parent Conqueror_g11_6c48eb finished #6 of 6 in both season #93
// matchups. The two bots that beat it implemented different
// improvements that g11 lacks:
//
//   - g5_897d51 (seed 21): tightened MARGIN from 0.6 to 0.45,
//     converting borderline kills into real ones.
//   - g6_1cded0 (seed 16): retake-aware kill scoring -
//     penalize backup enemies on the target's *other* neighbors,
//     reward friendly backup, and veto outright when a backup of
//     1.8+ would retake the captured tile at minimum cost.
//
// g11's hemisphere term is orthogonal to both of these (it reads
// the *attacker's* 5x5 stencil on the side being punched), so we
// can keep it AND add the two winning ideas. Net Pass-1 score:
//
//   score = enemy
//         + BACKING_WEIGHT * hemisphere_enemy_mass     (g11/g7_efa4e0)
//         - RETAKE_W       * worst_backup_enemy        (g6_1cded0)
//         + FRIENDLY_W     * best_friendly_backup      (g6_1cded0)
//
// with a hard veto on backup >= RETAKE_VETO and MARGIN tightened
// to 0.45 (g5_897d51). The veto threshold is dropped from g6's
// 1.8 to 1.5 because survivor strength dropped from 0.84 to 0.63
// when MARGIN tightened.
//
// Pass 2 (Conqueror.act when only non-kill adjacent actions
// exist) and Pass 3 (multi-candidate 5x5 stencil iteration with
// honest path-clear semantics) are unchanged from the parent;
// they are not what cost g11 the season.
//
// Tech is preserved. {move:90, stack:0, prod:2, atk:4, def:4} is
// the proven move-heavy blitz that every recent winner in this
// lineage runs - including both bots that beat the parent.
export default {
  name: "Conqueror_g12_f23241",
  author: "claude",
  version: 1,
  description: "g11 fused with g6_1cded0's retake-aware kill scoring (incl. free-retake veto) and g5_897d51's tightened MARGIN=0.45.",
  summary: `Parent Conqueror_g11_6c48eb finished #6 of 6 in both
season #93 matchups. The two bots that beat it implemented
orthogonal improvements g11 lacks:

  - g5_897d51 (seed 21): MARGIN 0.6 -> 0.45, picking up every
    fight in the band [enemy/1.4 + 0.45, enemy/1.4 + 0.6) as a
    real kill instead of a stall.
  - g6_1cded0 (seed 16): retake-aware Pass-1 scoring with a hard
    veto on captures whose backup enemy can trivially retake.

g11's hemisphere term reads the attacker's 5x5 stencil on the side
it's punching toward; the retake term reads the *target's* other
neighbors. They're orthogonal, so this descendant fuses all three
into one Pass-1 score:

  score = enemy
        + BACKING_WEIGHT * hemisphere_enemy_mass     (parent / g7_efa4e0)
        - RETAKE_W       * worst_backup_enemy        (g6_1cded0)
        + FRIENDLY_W     * best_friendly_backup      (g6_1cded0)

plus a hard veto on backup >= RETAKE_VETO (skip free-retake
captures) and MARGIN tightened to 0.45.

The veto threshold drops from g6's 1.8 to 1.5: with MARGIN=0.45
the survivor on a captured tile is MARGIN * BONUS = 0.63 (down
from 0.84 at MARGIN=0.6), so a backup of ~0.9 can already retake
at minimum cost. 1.5+ is unambiguously tempo-negative.

Pass 2 (Conqueror.act for non-kill adjacent actions) and Pass 3
(multi-candidate 5x5 stencil iteration with honest path-clear
semantics) are unchanged from the parent. The same MARGIN=0.45
flows through tryCommit and Pass-3 passability so all three
passes are consistent.

Tech preserved. {move:90, stack:0, prod:2, atk:4, def:4} is the
shared loadout of every recent winner in this lineage including
both bots that beat the parent; the losses were about kill
priority, not allocation.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Conqueror.act(army, game);
      return;
    }
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Pass 1: best beatable adjacent enemy by retake-aware,
    // hemisphere-weighted score (see file header for derivation).
    let bestKill = null;
    let bestScore = -Infinity;
    let bestNeeded = 0;
    let hasOtherTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasOtherTarget = true; continue; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;

        // Retake / support scan: target's *other* cardinal
        // neighbors. Skip the source tile (we're leaving it).
        let backup = 0;
        let friend = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0;
          let tnF = 0;
          for (let k = 0; k < ttArmies.length; k++) {
            const a = ttArmies[k];
            if (a.player.id === pid) tnF += a.strength;
            else tnE += a.strength;
          }
          if (tnE > backup) backup = tnE;
          if (tnF > friend) friend = tnF;
        }

        // Free-retake veto: any backup of 1.5+ will retake the
        // ~0.63 survivor at minimum cost next tick. Strictly
        // tempo-negative; skip rather than score.
        if (backup >= RETAKE_VETO) continue;

        // Hemisphere mass on the side we're punching into:
        // structural depth behind the target.
        let backing = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) backing += e;
          }
        }

        const score = enemy
          + BACKING_WEIGHT * backing
          - RETAKE_W * backup
          + FRIENDLY_W * friend;
        if (score > bestScore) {
          bestScore = score;
          bestNeeded = needed;
          bestKill = t;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with multi-candidate
    // iteration and honest path-clear semantics. MARGIN=0.45
    // flows through isPassable and tryCommit.
    if (!stencil) {
      Conqueror.act(army, game);
      return;
    }

    const passCache = [-1, -1, -1, -1];
    const isPassable = (dir) => {
      let v = passCache[dir];
      if (v >= 0) return v;
      const n = neighbors[dir];
      if (!n) { passCache[dir] = 0; return 0; }
      const armies = n.armies;
      if (armies.length === 0) { passCache[dir] = 1; return 1; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        v = (enemy / BONUS + MARGIN <= sLimit) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    const candidates = [];
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > sLimit + 0.5) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      candidates.push({ prim: hints[0], sec: hints[1], dist, enemy });
    }
    if (candidates.length === 0) {
      Conqueror.act(army, game);
      return;
    }

    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      const primaryTarget = neighbors[cand.prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (cand.sec < 0) continue;
      const secondaryTarget = neighbors[cand.sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
    Conqueror.act(army, game);
  },
};
