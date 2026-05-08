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

// Single-knob change vs parent g9_65e80c: swap Pass 3 from single-
// pick to multi-candidate iteration.
//
// Parent's losses in season #121 were both to Conqueror_g8_3280dd
// (seed=28 parent #2, seed=16 parent #6). g8_3280dd shares parent's
// hemisphere-weighted Pass 1 and tech, but diverges in Pass 3:
//
//   Parent:    pick the single best stencil candidate by
//              (dist, clear, weakness) and try its primary then
//              secondary cardinal. If both fail, give up.
//   g8_3280dd: collect every beatable stencil enemy, sort by
//              (dist, clear, weakness), then iterate - try each
//              candidate's primary then secondary in order, falling
//              through to the next candidate when both fail.
//
// Iteration is strictly more general: when the top pick is wedged
// (primary blocked by a too-strong adjacent, secondary blocked by
// a wall edge or the same situation), single-pick gives up while
// iteration tries the next-best candidate. On a 30x22 wrap board
// stalemate ticks are common and any unwasted action accumulates
// over a 376-tick game.
//
// Two coupled tweaks come along with the iteration kernel:
//   * isPassable cutoff matches tryCommit exactly:
//       enemy / BONUS + MARGIN <= sLimit
//     instead of parent's lenient
//       enemy / BONUS <= sLimit + 0.5
//     This is the same MARGIN tryCommit gates with, so the cache
//     never reports "passable" for a target tryCommit will refuse.
//   * Pass 3's beatability cutoff stays at sLimit + 0.5 (lenient)
//     because growth/intervening combat may close the gap before
//     we reach a 2-hop target.
//
// Pass 1 (hemisphere-weighted), Pass 2 (Conqueror.act fallback),
// MARGIN=0.6, BACKING_WEIGHT=0.4, and tech are byte-for-byte
// identical to parent. Only Pass 3 changes.
//
// Expected effect: when stalemate kicks in and parent's top
// candidate is doubly-wedged, this descendant tries siblings
// before giving up. That's a strict superset of parent's behavior
// in stalemate ticks - in non-stalemate ticks Pass 1 fires first
// and behavior is unchanged.
export default {
  name: "Conqueror_g10_34ca94",
  author: "claude",
  version: 1,
  description: "Parent g9_65e80c with Pass 3 swapped to g8_3280dd's multi-candidate iteration kernel - the only behavioral feature parent lacked vs the bot that beat it twice in season #121.",
  summary: `Parent Conqueror_g9_65e80c lost twice to Conqueror_g8_3280dd
in season #121 (seed=28 #2, seed=16 #6). Parent and g8_3280dd
share hemisphere-weighted Pass 1, MARGIN=0.6, BACKING_WEIGHT=0.4,
and tech {move:90, stack:0, prod:2, atk:4, def:4}. The only
behavioral difference is Pass 3:

  Parent:    single-pick (dist, clear, weakness), try primary
             then secondary. Give up if both fail.
  g8_3280dd: multi-candidate iteration. Collect every beatable
             stencil candidate, sort, then iterate - try each
             one's primary then secondary, falling through to
             the next candidate when both fail.

Iteration is a strict superset of single-pick in stalemate ticks.
When parent's top candidate is wedged (primary blocked by a too-
strong adjacent, secondary blocked by a wall or the same), single-
pick gives up; iteration tries the next-best candidate. On a 376-
tick game any unwasted action accumulates.

Two coupled tweaks come along with the iteration kernel:
  * isPassable cutoff matches tryCommit exactly
    (enemy / BONUS + MARGIN <= sLimit) so the cache never reports
    "passable" for a target tryCommit will refuse.
  * Pass 3 beatability stays at sLimit + 0.5 (lenient) because
    2-hop targets may shift before we arrive.

Pass 1, Pass 2, tech, and the constants are byte-for-byte
identical to parent. Only Pass 3 changes. Non-stalemate ticks are
unaffected (Pass 1 fires first); stalemate ticks now have a
fallback path the parent gave up on.

If this descendant beats parent, the takeaway is that parent's
single-pick Pass 3 was the regression vs the cousin lineage that
already had iteration. If it underperforms, the iteration kernel
is not the differentiator and the loss to g8_3280dd was driven by
something else (tech matchup, seed luck, or Pass 1 still scoring
poorly under board geometry).`,
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
    if (!stencil) return;

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
    if (candidates.length === 0) return;

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
  },
};
