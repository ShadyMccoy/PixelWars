// Instrumented variants of Conqueror_g8_4d842b and Conqueror_g8_2c6b71
// for the H2H analysis. Each variant has the same core logic as one of
// the originals but:
//   1) accepts a `_telemetry` global counter object keyed by name
//   2) optionally toggles EXPOSURE_WEIGHT (4d842b) or upgrades Pass 3
//      to the two-axis path-clear with tightened threshold (2c6b71's).
//
// Telemetry shape (per name):
//   pass1Triggered   - ticks where Pass 1 picked a kill target
//   pass1ChangedByExposure - ticks where the exposure debit caused the
//                            best target to differ from what
//                            "EXPOSURE_WEIGHT=0" would pick
//   pass2Triggered   - delegated to Conqueror.act for adjacent action
//   pass3Triggered   - reached stalemate stencil pick
//   pass3NoTarget    - stalemate produced no candidate
//   pass3Disagreed   - tick where the new (4-level) Pass 3 picked a
//                      different target than the old (binary) Pass 3
//                      would have picked
//   pass3OldUnreachable - ticks where the old Pass 3 would have chosen
//                          a target that the tight threshold flags as
//                          unreachable (tryCommit would refuse it)
//
// All variants are intentionally minor edits of the originals to keep
// behavioral parity high - the only changes are toggleable Pass 1 and
// Pass 3 mechanics + telemetry.

import { sumStrength } from "../../src/core/Army.js";
import Conqueror from "../../src/strategies/Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;

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
    const needed = enemy / BONUS + 0.6;
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

export const TELEMETRY = {};
function bucket(name) {
  if (!TELEMETRY[name]) {
    TELEMETRY[name] = {
      pass1Triggered: 0,
      pass1ChangedByExposure: 0,
      pass1ExposureNonzero: 0,
      pass2Triggered: 0,
      pass3Triggered: 0,
      pass3NoTarget: 0,
      pass3DisagreedOnTarget: 0,
      pass3OldPickedUnreachable: 0,
    };
  }
  return TELEMETRY[name];
}

// Configurable factory. opts:
//   exposureWeight  : number (0 disables the penalty). Default 0.2.
//   newPass3        : bool. true = 4-level path-clear + tight threshold.
//                          false = old (binary clear, sLimit+0.5).
//   name            : strategy name (also telemetry key).
function makeStrategy({ name, exposureWeight, newPass3 }) {
  return {
    name,
    author: "exp",
    version: 1,
    description: `instrumented variant exp=${exposureWeight} newPass3=${newPass3}`,
    tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const sLimit = army.attackPower;
      const tel = bucket(name);
      if (sLimit <= 0.5) {
        Conqueror.act(army, game);
        return;
      }
      const neighbors = tile.neighbors;
      const pid = army.player.id;
      const stencil = tile.stencil5;
      const viewer = army.player;

      // --- Pass 1: hemisphere-weighted adjacent kill (with optional
      // exposure debit). We compute the "no-exposure" choice in
      // parallel so we can detect when the penalty changed it.
      let bestKill = null;
      let bestScore = -Infinity;
      let bestNeeded = 0;
      let bestNoExpKill = null;
      let bestNoExpScore = -Infinity;
      let exposureEverNonzero = false;
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
          const needed = enemy / BONUS + 0.6;
          if (needed > sLimit) continue;
          let backing = 0;
          let exposure = 0;
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
            const oppIdxs = HEMI[i ^ 1];
            for (let k = 0; k < oppIdxs.length; k++) {
              const cell = stencil[oppIdxs[k]];
              if (!cell) continue;
              const cArmies = cell.armies;
              if (cArmies.length === 0) continue;
              const e = -sumStrength(cArmies, viewer);
              if (e > 0) exposure += e;
            }
          }
          if (exposure > 0) exposureEverNonzero = true;
          const baseScore = enemy + BACKING_WEIGHT * backing;
          const score = baseScore - exposureWeight * exposure;
          if (score > bestScore) {
            bestScore = score;
            bestNeeded = needed;
            bestKill = t;
          }
          if (baseScore > bestNoExpScore) {
            bestNoExpScore = baseScore;
            bestNoExpKill = t;
          }
          continue;
        }
        if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasOtherTarget = true;
        }
      }
      if (bestKill) {
        tel.pass1Triggered++;
        if (exposureEverNonzero) tel.pass1ExposureNonzero++;
        if (bestKill !== bestNoExpKill) tel.pass1ChangedByExposure++;
        army.attack(bestKill, bestNeeded);
        return;
      }

      if (hasOtherTarget) {
        tel.pass2Triggered++;
        Conqueror.act(army, game);
        return;
      }

      // --- Pass 3: stencil pick. We compute both old and new
      // tiebreaks in parallel and record divergence.
      tel.pass3Triggered++;
      if (!stencil) { tel.pass3NoTarget++; return; }

      const oldThresh = sLimit + 0.5;
      const newThresh = sLimit - 0.6; // == reachableEnemyOverBonus * BONUS / BONUS

      const passCacheBin = [-1, -1, -1, -1];
      const isPassableBin = (dir) => {
        let v = passCacheBin[dir];
        if (v >= 0) return v;
        const n = neighbors[dir];
        if (!n) { passCacheBin[dir] = 0; return 0; }
        const armies = n.armies;
        if (armies.length === 0) { passCacheBin[dir] = 1; return 1; }
        let friendlyArmy = null;
        let enemy = 0;
        for (let k = 0; k < armies.length; k++) {
          const a = armies[k];
          if (a.player.id === pid) friendlyArmy = a;
          else enemy += a.strength;
        }
        if (enemy > 0) v = (enemy / BONUS <= oldThresh) ? 1 : 0;
        else if (friendlyArmy) v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
        else v = 1;
        passCacheBin[dir] = v;
        return v;
      };
      const passCacheNew = [-1, -1, -1, -1];
      const isPassableNew = (dir) => {
        let v = passCacheNew[dir];
        if (v >= 0) return v;
        const n = neighbors[dir];
        if (!n) { passCacheNew[dir] = 0; return 0; }
        const armies = n.armies;
        if (armies.length === 0) { passCacheNew[dir] = 1; return 1; }
        let friendlyArmy = null;
        let enemy = 0;
        for (let k = 0; k < armies.length; k++) {
          const a = armies[k];
          if (a.player.id === pid) friendlyArmy = a;
          else enemy += a.strength;
        }
        if (enemy > 0) v = (enemy / BONUS <= sLimit - 0.6) ? 1 : 0;
        else if (friendlyArmy) v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
        else v = 1;
        passCacheNew[dir] = v;
        return v;
      };

      // Run both selection algorithms over the stencil.
      let oldPrim = -1, oldSec = -1, oldDist = Infinity, oldClear = -1, oldWeak = Infinity;
      let newPrim = -1, newSec = -1, newDist = Infinity, newClear = -1, newWeak = Infinity;
      for (let i = 0; i < 25; i++) {
        const hints = DIR_HINTS[i];
        if (hints[0] < 0) continue;
        const t = stencil[i];
        if (!t) continue;
        const enemy = -sumStrength(t.armies, viewer);
        if (enemy <= 0) continue;
        const dy = (i / 5) | 0;
        const dx = i - dy * 5;
        const dist = Math.abs(dx - 2) + Math.abs(dy - 2);

        // Old criterion: enemy/BONUS > sLimit + 0.5 disqualifies.
        if (enemy / BONUS <= oldThresh) {
          const clear = isPassableBin(hints[0]);
          if (
            dist < oldDist
            || (dist === oldDist && clear > oldClear)
            || (dist === oldDist && clear === oldClear && enemy < oldWeak)
          ) {
            oldDist = dist; oldClear = clear; oldWeak = enemy;
            oldPrim = hints[0]; oldSec = hints[1];
          }
        }
        // New criterion: enemy/BONUS > sLimit - 0.6 disqualifies.
        if (enemy / BONUS <= newThresh) {
          const primClear = isPassableNew(hints[0]);
          const secClear = hints[1] >= 0 ? isPassableNew(hints[1]) : 0;
          const clear = primClear * 2 + secClear;
          if (
            dist < newDist
            || (dist === newDist && clear > newClear)
            || (dist === newDist && clear === newClear && enemy < newWeak)
          ) {
            newDist = dist; newClear = clear; newWeak = enemy;
            newPrim = hints[0]; newSec = hints[1];
          }
        }
      }

      // Telemetry: did the two pickers disagree?
      const oldChose = oldPrim >= 0 ? `${oldPrim},${oldSec}` : "none";
      const newChose = newPrim >= 0 ? `${newPrim},${newSec}` : "none";
      if (oldChose !== newChose) tel.pass3DisagreedOnTarget++;

      // Telemetry: would the old picker have picked something the
      // tightened threshold considers unreachable?
      if (oldPrim >= 0) {
        const oldTile = neighbors[oldPrim];
        // Walk the stencil for the old's actual best target distance
        // so we can see if it's beyond sLimit-0.6. Recompute since we
        // didn't store the picked tile explicitly.
        // Simpler approximation: check if old's primary direction
        // becomes "blocked" under new threshold but "passable" under
        // old threshold.
        const oldP = isPassableBin(oldPrim);
        const newP = isPassableNew(oldPrim);
        if (oldP === 1 && newP === 0) tel.pass3OldPickedUnreachable++;
      }

      // Choose which selection to commit based on newPass3 flag.
      const usePrim = newPass3 ? newPrim : oldPrim;
      const useSec  = newPass3 ? newSec  : oldSec;
      if (usePrim < 0) { tel.pass3NoTarget++; return; }
      const primaryTarget = neighbors[usePrim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (useSec < 0) return;
      const secondaryTarget = neighbors[useSec];
      if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid);
    },
  };
}

// The four corners of the (exposure x newPass3) grid:
//   V_4d842b_orig    : exposure=0.2, newPass3=false (== Conqueror_g8_4d842b)
//   V_4d842b_noExp   : exposure=0.0, newPass3=false
//   V_4d842b_newP3   : exposure=0.2, newPass3=true
//   V_2c6b71_orig    : exposure=0.0, newPass3=true  (== Conqueror_g8_2c6b71)
//   V_2c6b71_addExp  : exposure=0.2, newPass3=true  (same as V_4d842b_newP3)
//   V_2c6b71_oldP3   : exposure=0.0, newPass3=false (same as V_4d842b_noExp)
//
// We expose all six logical names so telemetry can be keyed cleanly.

export const V_4d842b_orig   = makeStrategy({ name: "V_4d842b_orig",   exposureWeight: 0.2, newPass3: false });
export const V_4d842b_noExp  = makeStrategy({ name: "V_4d842b_noExp",  exposureWeight: 0.0, newPass3: false });
export const V_4d842b_newP3  = makeStrategy({ name: "V_4d842b_newP3",  exposureWeight: 0.2, newPass3: true  });
export const V_2c6b71_orig   = makeStrategy({ name: "V_2c6b71_orig",   exposureWeight: 0.0, newPass3: true  });

export const VARIANTS = {
  V_4d842b_orig,
  V_4d842b_noExp,
  V_4d842b_newP3,
  V_2c6b71_orig,
};
