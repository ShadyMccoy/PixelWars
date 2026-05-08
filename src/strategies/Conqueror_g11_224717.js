import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

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

// Pass 4 safety net, lifted verbatim from g6_b70bfa (the bot that
// beat the parent twice in season #128, on the two longest-tick
// games of the loss list: 483 and 465 ticks). When Pass 1 finds no
// margin-killable adjacent, hasOtherTarget is false (every neighbor
// is missing/friendly-full/enemy-too-strong), and Pass 3 either has
// no beatable stencil candidate or every candidate's primary and
// secondary tryCommit refuses, the parent currently just sits.
//
// tryNoMarginKill closes the window between tryCommit's gate
// (needed = enemy/BONUS + MARGIN <= sLimit) and the strict engine
// kill threshold (sLimit * BONUS * atkMult > enemy * defMult).
// A neighbor with enemy in [sLimit*BONUS - MARGIN*BONUS, sLimit*BONUS)
// gets refused by Pass 1's margin check yet a full-sLimit attack
// kills it. Survivor is thin, but the trade is favorable and the
// home garrison is untouched - exactly the standoffs that pile up
// in 400+ tick games where g6_b70bfa pulled ahead.
function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return false;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) { mixed = true; continue; }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) {
    army.attack(best, sLimit);
    return true;
  }
  return false;
}

// One-knob change vs parent g10_34ca94: graft g6_b70bfa's Pass 4
// no-margin kill safety net onto the parent's three-pass chassis.
//
// Parent's season #128 loss list: g6_b70bfa beat parent on seed=207
// (483 ticks) and seed=191 (465 ticks) - the two longest games. In
// long-tick games, full-stalemate ticks accumulate; the parent's
// Pass 3 stalls when every beatable stencil candidate's primary and
// secondary route through too-strong neighbors, and the parent then
// just sits. g6_b70bfa keeps acting via its no-margin kill, eating
// thin trades that compound into territory swings.
//
// Pass 1 (hemisphere-weighted), Pass 2 (Conqueror.act fallback),
// Pass 3 (multi-candidate iteration), MARGIN, BACKING_WEIGHT, HEMI,
// DIR_HINTS, tryCommit, and tech are byte-for-byte identical to the
// parent. The only addition is tryNoMarginKill called after Pass 3
// produces no commit. Strict superset: in non-stalemate ticks Pass 1
// fires first; in mild stalemate ticks Pass 3's iteration commits;
// only in deep stalemate where the parent gives up entirely does
// Pass 4 fire and try a thin-trade adjacent kill.
//
// Tech is unchanged: this change is a behavioral safety net, not a
// thesis about more aggression or movement, so the lineage's shared
// optimum {move:90, stack:0, prod:2, atk:4, def:4} stays.
export default {
  name: "Conqueror_g11_224717",
  author: "claude",
  version: 1,
  description: "Parent g10_34ca94 plus g6_b70bfa's Pass 4 no-margin kill safety net for full stalemate.",
  summary: `Parent Conqueror_g10_34ca94 lost season #128 games to
Conqueror_g6_b70bfa twice, on the two longest-tick games of the
loss list (seed=207 ticks=483, seed=191 ticks=465). The unique
feature g6_b70bfa carries that the parent lacks is its Pass 4
tryNoMarginKill safety net: when every other pass declines to
commit, it identifies the weakest adjacent enemy that is too
strong for tryCommit's MARGIN gate but still beatable by the
strict engine kill threshold (sLimit*BONUS*atkMult > enemy*defMult)
and goes all-in. Survivor is thin, but the raw trade is favorable
and the home garrison is untouched.

Long-tick games are exactly where this pays off. As territory
hardens both sides have full-strength armies sitting on full-
garrison tiles, and stencil5 candidates often route through too-
strong adjacents on every direction. The parent's Pass 3 then
fails for every candidate and the bot just sits. g6_b70bfa keeps
acting on those ticks. Over 400+ ticks the difference compounds.

This descendant grafts tryNoMarginKill onto the parent's existing
three-pass chassis. Pass 1 (hemisphere-weighted), Pass 2
(Conqueror.act for non-kill adjacency), Pass 3 (multi-candidate
iteration with honest path-clear), MARGIN=0.6, BACKING_WEIGHT=0.4,
HEMI, DIR_HINTS, tryCommit, and tech are byte-for-byte identical.
Pass 4 is the only addition, and it only fires when Pass 3 returns
nothing - true stalemate.

If this beats parent, the takeaway is that the parent's missing
ingredient vs g6_b70bfa was the safety net, not Pass 1 or Pass 3.
If it underperforms, the iteration kernel is already capturing
most stalemate value and Pass 4 is redundant on the existing
multi-candidate structure.`,
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
    let bestTile = null;
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
          bestTile = t;
          bestNeeded = needed;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Multi-candidate iteration over the
    // 5x5 stencil. Honest path-clear matches tryCommit's cutoff.
    if (stencil) {
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

      if (candidates.length > 0) {
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
      }
    }

    // Pass 4: last-resort no-margin kill on a slightly-too-strong
    // neighbor. Only fires when Pass 3 found nothing or every
    // candidate's primary and secondary refused tryCommit. This
    // is the safety net g6_b70bfa carries and the parent lacks.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
