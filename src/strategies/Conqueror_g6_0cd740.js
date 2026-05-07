import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent used SLACK = 0.6 — overshoot the breakeven threshold by 0.6
// strength on every commit. With atk:12 / def:8, surviving strength on
// captured tiles already gets a tech boost, so a smaller cushion is
// enough to hold the tile against the next regrowth tick. Tightening
// to 0.4 lets the army commit to ~0.2 strength less per fight, which
// frees that strength for the next adjacent commit and unlocks a few
// borderline attacks (enemy/BONUS + 0.4 ≤ sLimit) that the parent
// would have skipped.
const SLACK = 0.4;

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
    const needed = enemy / BONUS + SLACK;
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

export default {
  name: "Conqueror_g6_0cd740",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_0170df with tighter attack-commit slack (0.6 → 0.4).",
  summary: `Parent Conqueror_g5_0170df dominated season #26 with the
combat-leaning tech loadout { move:80, stack:0, prod:0, atk:12, def:8 }
and the closest-first stencil kernel. The kernel is left untouched —
no losses to react to.

The change is a single constant: the over-commit cushion in
tryCommit. Parent committed enemy/BONUS + 0.6 strength to every
fight; this descendant commits enemy/BONUS + 0.4. Two effects:

  1. Borderline attacks where the parent's threshold (needed > sLimit)
     just barely failed now succeed when the 0.2 difference brings
     them under sLimit. With sLimit = attackPower ≈ 4-5 on lab1 and
     enemies typically 1-3 strength, the marginal cases are exactly
     the close exchanges where atk:12 / def:8 tech tips survival in
     our favor anyway.
  2. Per successful commit, the leftover strength on the source tile
     is +0.2 higher, which the kernel routes into the next adjacent
     fight on the same tick if one exists.

Risk: 0.2 less survivor cushion on captured tiles. Worst case is a
neighbor immediately retaliates with enough force to flip the tile
back. With def:8 on the captured army and growth 1.8 refilling
strength quickly between ticks on lab1, that exposure is small.

Same target selection, same stencil ordering, same tech, same
hasAdjacentTarget gate, same fallback to Conqueror.act.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 12, def: 8 },
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
        const needed = enemy / BONUS + SLACK;
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
    let bestDist = Infinity;
    let bestEnemy = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestEnemy)) {
        bestDist = dist;
        bestEnemy = enemy;
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
