import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Single-knob change vs parent g10_34ca94: MARGIN 0.6 -> 0.45.
//
// Two of the three named winners that beat parent in season #127
// independently lowered MARGIN below 0.6:
//   * Conqueror_g9_fd075f -> MARGIN 0.4
//   * Conqueror_g9_d2499d -> MARGIN 0.45
//
// Picking the more conservative 0.45 (d2499d's value): every fight
// where attackPower lands in [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// becomes an actual kill instead of a stall, and 0.15 more strength
// stays home on every successful kill. d2499d's commentary noted
// 0.45 still beats float jitter and absorbs small mid-tick
// reinforcement; only a coordinated 0.6+ pile-on flips the kill,
// which is rare on lab1.
//
// Strategy code (Pass 1 hemisphere-weighted, Pass 2 Conqueror.act,
// Pass 3 multi-candidate iteration with isPassable matching
// tryCommit's exact MARGIN cutoff) is byte-for-byte identical to
// parent. Tech is unchanged at {90, 0, 2, 4, 4}. The MARGIN
// constant change automatically threads through both Pass 1's
// `needed` computation and tryCommit/isPassable in Pass 3, keeping
// all three passes self-consistent.
const MARGIN = 0.45;
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

export default {
  name: "Conqueror_g11_bc4fe7",
  author: "claude",
  version: 1,
  description: "Parent g10_34ca94 with MARGIN tightened from 0.6 to 0.45 (d2499d's proven knob).",
  summary: `Parent Conqueror_g10_34ca94 lost season #127 matches to
multiple winners including Conqueror_g9_fd075f and Conqueror_g9_d2499d.
Both winners share one structurally simple difference vs parent:
they tightened MARGIN below 0.6.

  * fd075f -> MARGIN 0.4
  * d2499d -> MARGIN 0.45

This descendant copies d2499d's 0.45 (the more conservative of the
two) into parent's three-pass kernel. Every fight where attackPower
lands in [enemy/1.4 + 0.45, enemy/1.4 + 0.6) becomes a kill the
parent currently refuses, and 0.15 more strength stays home on every
successful kill. d2499d's reasoning: 0.45 still clears float jitter
and small mid-tick reinforcement; only a coordinated 0.6+ pile-on
flips the kill, which is rare on lab1's 30x22 wrap board.

Strategy code is byte-for-byte identical to parent — Pass 1
hemisphere-weighted with BACKING_WEIGHT=0.4, Pass 2 Conqueror.act
fallback, Pass 3 multi-candidate iteration with isPassable matching
tryCommit's MARGIN cutoff exactly. The MARGIN constant change
automatically threads through Pass 1's 'needed' computation,
tryCommit (used by Pass 3), and isPassable's threshold, keeping all
three passes self-consistent.

Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4} — both
fd075f and d2499d kept this same tech, so it's not the differentiator.

Failure mode: if 0.45 is too aggressive, occasional borderline kills
flip to losses against coordinated mid-tick reinforcement. Recovery
margin is narrow (0.15) and the 0.4*1.4=0.56 post-kill surplus is
still positive ownership.`,
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
