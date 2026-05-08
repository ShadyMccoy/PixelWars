import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;
const TERRITORY_BIAS = 0.3;

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

// Parent g10_f5e8bf finished #4 of 6 in season #94 seed 7 (winner:
// Conqueror_g2_e90f66). The winner's distinguishing feature is *not*
// strategy code — it's plain Conqueror.act — but a pure tech rebalance
// from {move:90, stack:0, prod:2, atk:4, def:4} to
// {move:80, stack:0, prod:0, atk:4, def:16}, raising the def
// multiplier from 0.872x to 0.968x (+11% durability) at the cost
// of a small garrison giveback (0.60 -> 0.70).
//
// The spawn brief flags tech as "historically under-explored" in this
// lineage: descendants overwhelmingly preserve the parent's tech and
// tune only strategy code, so a strategy that benefits from a defensive
// posture is running on tech that taxes defense by 13%. g10's
// counter-attack guard is precisely that kind of strategy — it aborts
// pyrrhic kills when the post-attack remainder can't survive the
// strongest counter. Better defense makes more remainders survivable,
// which both
//   (a) directly reduces losses to counter-attacks the guard already
//       worried about, and
//   (b) lets the *guard* trip less often, so Pass 1 commits the kill
//       it actually wanted instead of falling through to Conqueror.act.
// Both effects compound — the strategy and the tech align on the same
// failure mode (multi-front pressure on a brittle attacker).
//
// Strategy code is preserved verbatim from g10 so the change is
// strictly the tech rebalance to match the winning archetype's
// loadout. This is the minimal-risk way to test the hypothesis that
// g10's strategy + g2_e90f66's tech composes cleanly: same kernel,
// new def floor.
export default {
  name: "Conqueror_g11_cb02bc",
  author: "claude",
  version: 1,
  description: "g10 strategy with g2_e90f66's defensive tech rebalance (80/0/0/4/16) to fix the 13% def tax.",
  summary: `Parent Conqueror_g10_f5e8bf finished #4 of 6 in season #94
seed 7 to Conqueror_g2_e90f66, which is plain Conqueror with a single
non-strategy change: tech rebalanced from {90,0,2,4,4} to
{80,0,0,4,16}, raising def from 0.872x to 0.968x (+11% durability) at
the cost of a small garrison giveback (0.60 -> 0.70).

The spawn brief flags tech as historically under-explored in this
lineage: descendants almost always preserve the parent's tech and
tune only strategy code, so a strategy whose central feature is a
counter-attack defensive guard (g8's contribution, ported into g10)
is running on a tech profile that taxes defense by 13%. The strategy
spends cycles deciding *not* to commit kills because the remainder
can't survive a counter — and yet the remainder is brittle by
construction.

This descendant ports g2_e90f66's tech onto g10's three-pass kernel
verbatim. Pass 1 territory-bias scoring + counter-attack guard, Pass 2
Conqueror.act fallback, and Pass 3 5x5 stencil with distance-first /
two-axis path-clear / weakness-last are all unchanged. The bet is
that the strategy and the tech align on the same failure mode:
better def (a) directly reduces losses to counter-attacks the guard
already worries about, and (b) lets the guard trip less often, so
Pass 1 commits the kill it actually wanted instead of falling through.

Single tech-only diff against parent. Strategy code is bit-for-bit
identical to g10_f5e8bf. The only knob change is tech.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 4, def: 16 },
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

    const enemyAt = [0, 0, 0, 0];
    let bestKill = null;
    let bestKillIdx = -1;
    let bestScore = -1;
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
        enemyAt[i] = enemy;
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;
        let friendlyNbrs = 0;
        const tn = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = tn[n];
          if (nt && nt.ownerId === pid) friendlyNbrs++;
        }
        const score = enemy + TERRITORY_BIAS * friendlyNbrs;
        if (score > bestScore) {
          bestScore = score;
          bestNeeded = needed;
          bestKill = t;
          bestKillIdx = i;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      const remaining = army.strength - bestNeeded;
      let maxOther = 0;
      for (let i = 0; i < 4; i++) {
        if (i === bestKillIdx) continue;
        const e = enemyAt[i];
        if (e > maxOther) maxOther = e;
      }
      if ((maxOther - 1) * BONUS < remaining) {
        army.attack(bestKill, bestNeeded);
        return;
      }
    }

    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    if (!tile.stencil5) {
      Conqueror.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

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
        v = (enemy / BONUS <= sLimit + 0.5) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestClear = -1;
    let bestWeak = Infinity;
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
      const primClear = isPassable(hints[0]);
      const secClear = hints[1] >= 0 ? isPassable(hints[1]) : 0;
      const clear = primClear * 2 + secClear;
      if (
        dist < bestDist
        || (dist === bestDist && clear > bestClear)
        || (dist === bestDist && clear === bestClear && enemy < bestWeak)
      ) {
        bestDist = dist;
        bestClear = clear;
        bestWeak = enemy;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }
    if (bestPrim < 0) {
      Conqueror.act(army, game);
      return;
    }

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) {
      Conqueror.act(army, game);
      return;
    }
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    Conqueror.act(army, game);
  },
};
