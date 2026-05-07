import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g8_9d8b65 used MARGIN=0.6. Sibling-line g6_15ea9a (which
// beat parent in season #74 seed=136) ran MARGIN=0.4 and outranked
// its own ancestors. Lower margin opens kills in the band
// (sLimit - 0.6, sLimit - 0.4] that parent currently refuses, and
// post-kill surplus is still 0.4 * 1.4 = 0.56 (positive ownership
// with a small garrison). Saves 0.2 strength at home per kill,
// compounding across long Membrane-pressure matches where parent's
// losses concentrated.
const MARGIN = 0.4;
const BACKING_WEIGHT = 0.4;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3 -> the
// stencil cells on that side, with axis cells excluded so hemispheres
// don't overlap.
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

// Parent g8_9d8b65 lost 5 of its tracked matches in season #74
// (finishing #4-#6 of 6 every time). The winners were a mix of
// {Conqueror_g7_98d20f, Conqueror_g7_efa4e0, Conqueror_g6_15ea9a,
//  Conqueror_g5_d70030}. Three of those four winners share tech
// {move:90, stack:0, prod:2, atk:4, def:4}; parent had moved to
// {move:80, stack:12, prod:2, atk:3, def:3}, betting that lab1's
// maxArmy=12 made the stack knob worth 10 points. The matchup
// data says the bet failed.
//
// On a 30x22 wrap board, more action density and longer push paths
// favor:
//   - move>=90 (low garrison floor, more strength projected per tick),
//   - atk/def at 4 (each kill spends less and survives more incoming),
//   - stack at 0 (the cap is set by the engine's maxArmy * stack mult;
//     on lab1 the marginal extra cap rarely converts before a fight
//     resets the army anyway, while losing 0.1 garrison and a 1.0x
//     atk/def costs every single tick).
//
// Three independent improvements, observed in the bots that beat
// parent, compose without conflict:
//
//   1. Tech revert to 90/0/2/4/4 (shared by 98d20f, efa4e0, 15ea9a).
//      Undo parent's stack bet.
//
//   2. Pass 1 hemisphere-weighted kill priority — kept from parent
//      (also adopted by efa4e0). Adjacent enemy with deep backing
//      gets prioritized over a fat facade.
//
//   3. Pass 3 multi-candidate iteration with HONEST isPassable
//      (from 98d20f). Parent's isPassable used the threshold
//      `enemy/BONUS <= sLimit + 0.5` for the tiebreak, but
//      tryCommit's real threshold is `enemy/BONUS + MARGIN <= sLimit`.
//      Enemies in the gap counted as "passable" for sorting yet
//      refused the actual commit. Also, parent only tried the top
//      stencil candidate's primary/secondary — if both failed, the
//      tick was wasted even when a sibling stencil candidate had a
//      clean lane. Fix: sort all beatable stencil candidates by
//      (distance asc, primary-clear desc, weakness asc) using the
//      real threshold, then iterate primary->secondary on each
//      until one tryCommit lands.
//
//   4. MARGIN 0.6 -> 0.4 (from 15ea9a). Opens near-parity kills
//      parent currently refuses; post-kill surplus 0.4*1.4=0.56 is
//      still safe ownership.
//
// All four upgrades fire on disjoint or strictly-additive entry
// conditions. Risk is mostly tech-revert: if maxArmy=12's stack
// premium is real, this loses ~0-2 points per match vs parent. The
// upside is the three head-to-head losing matchups parent has
// against winners that already use this exact tech.
export default {
  name: "Conqueror_g9_fd075f",
  author: "claude",
  version: 1,
  description: "Revert parent's stack bet to proven 90/0/2/4/4, fuse 98d20f's honest multi-candidate Pass 3, drop MARGIN to 0.4.",
  summary: `Parent Conqueror_g8_9d8b65 went 0-for-5 in tracked
season #74 matches, losing to four different winners: g7_98d20f,
g7_efa4e0, g6_15ea9a, and g5_d70030. Three of those four share a
specific tech — {move:90, stack:0, prod:2, atk:4, def:4} — that
parent abandoned for {move:80, stack:12, prod:2, atk:3, def:3}.
The bet was that lab1's maxArmy=12 made stack worth 10 points.
The win/loss record disagrees.

This descendant rolls back the tech and stacks every kernel
upgrade observed in the bots that beat parent:

  1. TECH REVERT to 90/0/2/4/4. Shared by all three winning
     descendants in parent's loss log. The 80-move + atk/def 3
     trade was costing every tick; the cap gain from stack=12
     rarely converted before fights reset armies anyway.

  2. PASS 1 hemisphere-weighted kill priority (kept from parent,
     also adopted by efa4e0). Adjacent enemy + 0.4 * deep backing
     beats out fat facades.

  3. PASS 3 honest multi-candidate iteration (from 98d20f).
     - isPassable's threshold now matches tryCommit exactly
       (enemy/BONUS + MARGIN <= sLimit), so the path-clear tiebreak
       reflects what is actually committable this tick.
     - Build the full beatable-candidate list, sort by
       (distance asc, primary-clear desc, weakness asc), iterate
       primary->secondary on each until one tryCommit lands.
       Parent stalled when its top pick had no working primary AND
       no secondary; this descendant falls through to siblings.

  4. MARGIN 0.6 -> 0.4 (from 15ea9a, which beat parent in seed=136).
     Opens kills in the band (sLimit - 0.6, sLimit - 0.4] parent
     refuses. Post-kill surplus is 0.4 * 1.4 = 0.56 (positive
     ownership, small garrison). Saves 0.2 home strength per kill.

Risk: if the maxArmy=12 stack premium is genuinely real, the tech
revert is a 0-2 point regression vs parent on average. The win/loss
record in season #74 says it isn't, and the three matched
head-to-head losses (98d20f, efa4e0, 15ea9a) all run 90/0/2/4/4.
Net expected delta is positive.`,
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

    // Pass 1: hemisphere-weighted adjacent kill picker.
    let bestKill = null;
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
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;

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
        const score = enemy + BACKING_WEIGHT * backing;
        if (score > bestScore) {
          bestScore = score;
          bestKill = t;
          bestNeeded = needed;
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

    // Pass 3: full stalemate. 5x5 with multi-candidate iteration.
    if (!stencil) return;

    // Cardinal passability cache. Threshold matches tryCommit's
    // exact cutoff so the tiebreak below tells the truth about
    // what is reachable this tick.
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

    // Collect every beatable stencil enemy. Lenient sLimit + 0.5
    // threshold here because a stencil target is up to 2 hops away
    // and growth/combat may close the gap by arrival.
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
    if (candidates.length === 0) return;

    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    // First successful commit wins; if a candidate's primary AND
    // secondary both refuse, fall through to the next.
    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      const primaryTarget = neighbors[cand.prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (cand.sec < 0) continue;
      const secondaryTarget = neighbors[cand.sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
  },
};
