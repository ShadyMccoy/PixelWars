import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Inherited from g5_897d51: tightened margin catches the
// [enemy/1.4 + 0.45, enemy/1.4 + 0.6) band as real kills.
const MARGIN = 0.45;
// New: hemisphere weight for Pass 1 tiebreak. Both bots that
// beat the parent in season #116 (g6_27c4e7 with 0.5, g9_65e80c
// with 0.4) use this term. Picking 0.4 — the more conservative of
// the two — because the parent's MARGIN=0.45 already biases Pass 1
// toward more aggressive commits, so an aggressive tiebreak (0.5)
// risks compounding into bad standoffs against thin facades.
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

export default {
  name: "Conqueror_g7_ab60a0",
  author: "claude",
  version: 1,
  description: "Parent g6_b70bfa with hemisphere-weighted Pass 1 tiebreak (BACKING_WEIGHT=0.4).",
  summary: `Parent Conqueror_g6_b70bfa lost both recorded games in
season #116. The two winners that beat it (Conqueror_g6_27c4e7,
seed=19; Conqueror_g9_65e80c, seed=3) both share a single feature
the parent lacks: hemisphere-weighted Pass 1 kill scoring, which
biases the adjacent kill choice toward enemies that have more
backing mass behind them in the 5x5 stencil — i.e., killing into
the structural wall instead of a thin facade.

Single targeted change vs parent: in Pass 1, when multiple adjacent
enemies are killable under the MARGIN=0.45 budget, score each by
(enemy_strength + BACKING_WEIGHT * hemisphere_enemy_mass) instead of
raw enemy_strength. Adjacent value (1.0/unit) still dominates the
diluted hemisphere term (0.4 across up to 10 cells), so genuinely
uneven matchups still kill the strongest local target. We only
sharpen the tiebreaker.

Everything else is preserved byte-for-byte:
  - MARGIN = 0.45 (the parent's signature tightened-margin commit).
  - Pass 2 punt to Conqueror.act when other adjacent action exists.
  - Pass 3 stencil5 routing toward closest beatable enemy.
  - Pass 4 tryNoMarginKill safety net for true stalemates.
  - Tech {move:90, stack:0, prod:2, atk:4, def:4} unchanged.

BACKING_WEIGHT chosen at 0.4 (matches g9_65e80c) rather than 0.5
(g6_27c4e7) because the parent's tighter MARGIN already commits to
more borderline kills than either winner's MARGIN=0.6, so layering
an aggressive tiebreak risks compounding bad commits.`,
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

    // Pass 1: hemisphere-weighted kill scorer.
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

    // Pass 2: any other adjacent action viable -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Stencil5 routing toward closest
    // beatable enemy (tiebreak weakest).
    if (stencil) {
      const reachableEnemyOverBonus = sLimit - MARGIN;

      let bestPrim = -1;
      let bestSec = -1;
      let bestDist = Infinity;
      let bestWeak = Infinity;
      for (let i = 0; i < 25; i++) {
        const hints = DIR_HINTS[i];
        if (hints[0] < 0) continue;
        const t = stencil[i];
        if (!t) continue;
        const enemy = -sumStrength(t.armies, viewer);
        if (enemy <= 0) continue;
        if (enemy / BONUS > reachableEnemyOverBonus) continue;
        const dy = (i / 5) | 0;
        const dx = i - dy * 5;
        const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
        if (dist < bestDist || (dist === bestDist && enemy < bestWeak)) {
          bestDist = dist;
          bestWeak = enemy;
          bestPrim = hints[0];
          bestSec = hints[1];
        }
      }
      if (bestPrim >= 0) {
        const primaryTarget = neighbors[bestPrim];
        if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
        if (bestSec >= 0) {
          const secondaryTarget = neighbors[bestSec];
          if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
        }
      }
    }

    // Pass 4: last-resort no-margin kill. Preserved from parent.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
