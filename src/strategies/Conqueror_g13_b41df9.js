import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

// Hypothesis (one knob, one reason): adopt Conqueror_g10_cbab8a's
// tech reallocation (move 90 -> 80, prod 2 -> 12) on top of g12's
// strictly-stronger Pass-1 strategy.
//
// Why this should help:
//   - g10_cbab8a beat the parent g12 in season #126 seed=224 with
//     a tech-only delta from a g9 ancestor. Its rationale: with
//     MARGIN tightened to 0.45, less strength is burned per kill,
//     so a larger fraction of produced strength is *deployable* -
//     production becomes worth more in a 0.45-margin world than in
//     a 0.6-margin world. That logic applies identically to g12,
//     which also runs MARGIN=0.45.
//   - move:90 saturates lab1's 30x22 / maxArmy 12 garrison floor.
//     Dropping to 80 keeps the floor comfortably above what the
//     act() loop actually consumes per tick, while +10 prod buys
//     a ~10-15% multiplier on per-turn supply that compounds with
//     g12's hemisphere / retake-aware kill prioritisation.
//   - The spawner explicitly flags tech as under-explored in this
//     lineage. g10's win is direct evidence the move->prod shift
//     pays off; bringing it onto g12's superior strategy chassis
//     should be additive, not redundant: g10 lacks g12's
//     hemisphere term and free-retake veto, both of which fired
//     in g12's design but didn't save it from g10's tech edge.
//
// Strategy code (Pass 1 retake-aware + hemisphere scoring, Pass 2
// Conqueror.act fallback, Pass 3 walk-all-candidates 5x5 stencil
// with honest path-clear semantics) is byte-identical to the
// parent. Only the tech field changes. atk/def stay at 4/4 because
// the strategy's needed-strength math is keyed off BONUS=1.4;
// shifting atk would either waste surplus or under-commit.

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
  name: "Conqueror_g13_b41df9",
  author: "claude",
  version: 1,
  description: "Conqueror_g12_f23241 with g10_cbab8a's tech move 90->80, prod 2->12. Strategy code unchanged.",
  summary: `Parent Conqueror_g12_f23241 finished mid-pack in season #126
(losses at seeds 240/229/224/217/212). The most informative loss is
seed=224, where Conqueror_g10_cbab8a won with a tech-only delta from
a shared g9 ancestor: move 90 -> 80, prod 2 -> 12.

g10's stated rationale applies identically to g12: both bots run
MARGIN=0.45, so both burn less strength per kill than the older
MARGIN=0.6 lineage. That makes a larger fraction of each tile's
produced strength deployable, and production becomes proportionally
more valuable than it was at MARGIN=0.6. The +10 prod shift buys a
~10-15% multiplier on per-turn supply that compounds directly with
the kill loop g12 already runs.

g10 beat g12 in season #126 with strictly weaker strategy code (no
hemisphere term, no free-retake veto, simpler exposure heuristic).
That is direct evidence the tech delta is doing the work. Bringing
the same tech onto g12's superior chassis should be additive: g12's
hemisphere / retake-aware Pass 1 stays intact, the walk-all-candidates
Pass 3 stays intact, and the new tech feeds them more deployable
strength per tick.

move:80 still saturates the garrison floor on lab1 (30x22, maxArmy
12). atk/def stay at 4/4 because the needed-strength math is keyed
off BONUS=1.4 - moving atk would either waste surplus or under-commit.
stack stays at 0; the strategy doesn't lean on multi-army stacks.

Strategy code (Pass 1 / Pass 2 / Pass 3) is byte-identical to the
parent. Only the tech field changes. If the descendant regresses,
the next iteration should try a smaller +5 prod shift; if it wins,
this lineage finally has a precedent for tech tuning compounding
with strategy work instead of the two evolving in isolation.`,
  tech: { move: 80, stack: 0, prod: 12, atk: 4, def: 4 },
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

    let bestKill = null;
    let bestScore = -Infinity;
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

        let backup = 0;
        let friend = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0;
          let tnF = 0;
          for (let k = 0; k < ttArmies.length; k++) {
            const a = ttArmies[k];
            if (a.player.id === pid) tnF += a.strength;
            else tnE += a.strength;
          }
          if (tnE > backup) backup = tnE;
          if (tnF > friend) friend = tnF;
        }

        if (backup >= RETAKE_VETO) continue;

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

        const score = enemy
          + BACKING_WEIGHT * backing
          - RETAKE_W * backup
          + FRIENDLY_W * friend;
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

    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    if (!stencil) {
      Conqueror.act(army, game);
      return;
    }

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
    if (candidates.length === 0) {
      Conqueror.act(army, game);
      return;
    }

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
    Conqueror.act(army, game);
  },
};
