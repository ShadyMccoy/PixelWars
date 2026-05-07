import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

// Parent Conqueror_g3_51d626 lost season #25 to its sibling
// Conqueror_g5_0170df, which kept the same kernel but rotated tech
// from { move:90, stack:0, prod:2, atk:4, def:4 } toward combat:
// { move:80, stack:0, prod:0, atk:12, def:8 }.
//
// Reading techs.md: knobs use multiplier = 1.0 + (tech - 20) * slope,
// with 20 as the baseline. The parent's atk:4 and def:4 are FAR below
// baseline — they are combat penalties, not buffs. The winning sibling
// only partially corrected this: atk:12 and def:8 are still below
// baseline (still penalties, just smaller ones). So the obvious next
// step is to push combat allocation higher — past baseline on atk in
// particular.
//
// This descendant keeps the parent's logic byte-for-byte (weakest-first
// stencil selection, with closer-distance tiebreak; secondary-axis
// fallback when the primary neighbor is blocked). Only tech changes:
//   { move:70, stack:0, prod:0, atk:18, def:12 }
// Garrison goes from 0.6 to 0.8 (still well under typical attackPower).
// atk goes ~1.7× the parent's allocation and crosses closer to baseline.
// def goes 3× the parent's allocation. The hypothesis: the parent's
// tight-margin attacks (needed = enemy / 1.4 + 0.6) leave just 0.6
// strength of slack, and a sub-baseline atk multiplier turns that
// slack into a coin flip on tied exchanges. Boosting atk past the
// winner's level should convert more close calls into clean wins,
// reducing the second-attempt commits that pile up into stalls.
//
// The deliberate difference vs Conqueror_g5_0170df is that we keep the
// parent's weakest-first stencil ordering rather than the winner's
// closest-first. With stronger combat tech, weakest-first should pay
// off more: combat buffs make every fight cheaper, so the marginal
// value of picking the easiest-to-kill stencil enemy increases
// (cleaner kills, less follow-up pressure on the home tile).
export default {
  name: "Conqueror_g4_07dbf8",
  author: "claude",
  version: 1,
  description: "Conqueror_g3 with combat-heavy tech (atk 18 / def 12) — pushes past the winning sibling's atk:12 allocation.",
  summary: `Parent Conqueror_g3_51d626 lost in season #25 to sibling
Conqueror_g5_0170df, which kept the kernel intact and only rotated
tech toward combat (move 90→80, atk 4→12, def 4→8). Per techs.md the
combat multiplier is 1.0 + (tech-20)*slope, so the parent's atk:4 and
def:4 are sub-baseline penalties. The winner partly corrected this
but stopped at atk:12 — still below baseline.

This descendant keeps parent logic byte-for-byte (weakest-first
stencil selection with distance tiebreak, secondary-axis fallback,
identical kernel and tryCommit) and pushes tech further:
  move:70 (garrison 0.8, mild reduction in attackPower)
  stack:0 prod:0 (unchanged from winner)
  atk:18  def:12  (vs winner's 12/8 — meaningfully stronger combat)

The parent's tight attack threshold (needed = enemy/1.4 + 0.6) is
fragile under sub-baseline atk: small numerical miscalculations and
mid-tick growth on the defender can turn a 0.6-margin win into a
loss. Combat-heavy tech reduces those marginal failures and the
stall cycles they cause. We keep weakest-first selection on the
hypothesis that combat buffs make easy-prey kills cheaper still,
reducing follow-up pressure on the home tile.`,
  tech: { move: 70, stack: 0, prod: 0, atk: 18, def: 12 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed <= sLimit) { hasAdjacentTarget = true; break; }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestEnemy = Infinity;
    let bestDist = 0;
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
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
        bestDist = dist;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }
    if (bestPrim < 0) return;

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid);
  },
};
