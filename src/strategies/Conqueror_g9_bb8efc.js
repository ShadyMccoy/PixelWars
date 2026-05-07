import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;

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

// Parent Conqueror_g8_a9c587 ran {move:90, stack:0, prod:2, atk:4,
// def:4} — a 90-point dump into garrison reduction with everything
// else in deep sub-baseline territory. The sibling tech-rebalance
// descendant Conqueror_g9_f7d113 proved the parent loses on tech
// alone (same kernel, swapped to g3_4a7a4a's 75/0/2/13/10 to win),
// and explicitly left a clean test bed by holding the kernel
// byte-for-byte stable. This descendant takes that same discipline
// (kernel byte-for-byte identical to parent and to g9_f7d113) and
// pushes the tech rebalance further along the same axis, tuned to
// what's specific about the lab1 test map.
//
// Why push further on tech instead of changing the kernel:
//
//   1. lab1 is 30x22 with maxArmy 12 and wrap. The g9_f7d113 design
//      note was reasoning about a "24x18 maxArmy 6" environment;
//      under lab1's larger map and double the army cap, three of the
//      parent's tech allocations look even more wasteful:
//
//       - stack=0 throws away half the maxArmy headroom. With
//         maxArmy 12, every army that could be holding 12 is
//         instead capped near 6 (stack tech 0 is well below the
//         tech=20 anchor at 1.0x). On a bigger map fights resolve
//         over more ticks; carrying more strength into each fight
//         compounds.
//       - prod=2 starves regen on the same longer-fight map.
//       - atk=4 / def=4 keep the per-fight attacker/defender
//         multipliers deep below 1.0x, so even with a fat
//         attackPower budget, the *effective* strength delivered
//         and the resilience to incoming hits both leak.
//
//   2. g9_f7d113 is a sibling, not an ancestor — it is the cleanest
//      possible reference baseline. If this descendant beats both
//      the parent and g9_f7d113, the diff isolates "did we push the
//      tech rebalance the right amount?" cleanly, because the only
//      thing that changed between this and g9_f7d113 is the tech
//      vector. If it underperforms g9_f7d113, future descendants
//      know g9_f7d113's allocation was already at or past the sweet
//      spot and can bias back toward it.
//
//   3. g9_f7d113's design note explicitly anticipates a kernel-level
//      descendant — it said "the next descendant has clean ground
//      to test a kernel change against." Doing a kernel change now
//      would mean comparing a *new* kernel against a *different*
//      tech baseline (parent's), losing that clean ground. So this
//      descendant deliberately stays on the tech axis to preserve
//      the experimental setup g9_f7d113 created.
//
// THE CHANGE: tech becomes {move:50, stack:10, prod:5, atk:20, def:15}.
// Compared to parent (and to g9_f7d113):
//
//                  parent     g9_f7d113   THIS (g9_bb8efc)
//   move           90         75          50
//   stack          0          0           10
//   prod           2          2           5
//   atk            4          13          20
//   def            4          10          15
//
//   move=50 -> garrison floor 1.25 (vs parent 1.05, vs g9 1.125,
//     vs neutral-anchor 1.4). Still a meaningful edge over neutral
//     but less extreme; the marginal benefit of move past ~50 is
//     small (the formula is linear and bounded), and that 25 points
//     of move "savings" buys more atk and the first ever stack
//     investment in this lineage.
//
//   stack=10 -> roughly half-anchor on max strength cap. First time
//     this lineage has put any points into stack at all. On lab1's
//     maxArmy=12 map this matters: even half-anchor stack lets each
//     army hold materially more than parent's stack=0 allowed.
//
//   prod=5 -> still sub-anchor but 2.5x the parent's allocation.
//     The 30x22 map's longer matches make prod sub-baseline more
//     costly than on the 24x18 reference map.
//
//   atk=20 -> the neutral 1.0x attacker multiplier. No more
//     per-fight outgoing penalty at all. g9_f7d113 reached atk=13
//     (still ~35% under anchor on the assumed slope); this hits
//     parity. Every Pass 1 strongest-beatable kill computed by the
//     kernel now pays no tech tax on outgoing damage.
//
//   def=15 -> 25% under the def anchor. g9_f7d113 was at def=10
//     (50% under). Less garrison-side bleed during the inevitable
//     enemy counterattacks that the kernel's aggressive Pass 1
//     invites.
//
// Sum check: 50 + 10 + 5 + 20 + 15 = 100. ✓
//
// Kernel preserved BYTE-FOR-BYTE: Pass 1 strongest-beatable kill,
// Pass 2 Conqueror.act fallthrough, Pass 3 two-axis path-clear 5x5
// stencil with distance-first / clear / weakness tiebreak. Same
// MARGIN (0.4), same BONUS (1.4), same DIR_HINTS table, same
// tryCommit, same passCache. Only the tech field changes. This is
// deliberate single-axis exploration so the next descendant can
// either lock in this tech and finally test a kernel change, or
// retreat back toward g9_f7d113's allocation if maxArmy 12 turns
// out to want more move/less stack than predicted.
export default {
  name: "Conqueror_g9_bb8efc",
  author: "claude",
  version: 1,
  description: "Conqueror_g8_a9c587 kernel verbatim with a deeper tech rebalance for lab1 (50/10/5/20/15).",
  summary: `Parent Conqueror_g8_a9c587 ran 90/0/2/4/4 — extreme move
investment with sub-baseline everything else. Sibling descendant
Conqueror_g9_f7d113 already proved the parent loses on tech alone
by adopting g3_4a7a4a's 75/0/2/13/10. This descendant pushes the
same axis further, tuned for the lab1 test map (30x22, maxArmy 12,
wrap), where stack=0 wastes half the army cap and longer fights
make sub-baseline prod and atk/def even more costly than on the
24x18 / maxArmy 6 reference map.

Tech becomes {move:50, stack:10, prod:5, atk:20, def:15}.
Comparison:
                 parent     g9_f7d113   this
  move           90         75          50
  stack          0          0           10
  prod           2          2           5
  atk            4          13          20
  def            4          10          15

atk hits the neutral 1.0x anchor exactly, eliminating the outgoing
attack penalty entirely. def reaches 75% of anchor, halving the
garrison-side bleed g9_f7d113 still pays. stack gets the lineage's
first nonzero allocation, finally letting armies fill toward the
maxArmy=12 cap. move drops to 50 — garrison floor 1.25, still a
real edge over the 1.4 neutral, but recognising the formula is
linear and the marginal benefit of move past ~50 is small.

Kernel preserved byte-for-byte from parent and from g9_f7d113:
Pass 1 strongest-beatable adjacent kill, Pass 2 Conqueror.act
fallthrough, Pass 3 two-axis path-clear 5x5 stencil with
distance-first / clear / weakness-last sort. MARGIN 0.4, BONUS 1.4
unchanged.

Single-axis discipline preserved: only the tech vector moves vs
g9_f7d113, so a head-to-head between the two siblings cleanly
isolates "did we push the rebalance the right amount?" The next
descendant inherits whichever tech wins, freed up to finally test
a kernel change against the better-anchored baseline.`,
  tech: { move: 50, stack: 10, prod: 5, atk: 20, def: 15 },
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

    // Pass 1: strongest beatable adjacent enemy (no reach weighting).
    let bestKill = null;
    let bestEnemy = -1;
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
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
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

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // two-axis path-clear tiebreak, weakness as final tiebreak.
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
