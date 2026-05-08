import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

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

// One-change descendant: re-allocate 2 tech points from def to atk,
// lifting the parent's loadout from {move:90, stack:0, prod:2, atk:4,
// def:4} to {move:90, stack:0, prod:2, atk:6, def:2}. Strategy code
// is byte-identical to g12_f23241.
//
// Why this should help (vs the recorded losses):
// - Cousin g6_ee139a beat the parent in season #123 seed=224 with
//   exactly this tech swap on a structurally similar offense-first
//   chassis (same Pass 1 hemisphere/kill scoring, same Pass 2
//   fallback, same closest-first Pass 3). The lineage prompt also
//   explicitly flags tech as under-explored.
// - g12's three passes are pure offense: hunt the strongest beatable
//   adjacent (Pass 1, retake-aware + hemisphere), grab any other
//   adjacent action (Pass 2), then walk toward the closest beatable
//   stencil5 enemy (Pass 3). It almost never sits and soaks. def=4
//   was paying for a defensive posture this bot does not adopt;
//   atk=6 amplifies the per-turn multiplier the bot actually
//   exercises every kill.
// - Side effect: BONUS=1.4 is a fixed kill-margin estimate, so a
//   higher real combat ratio means we may very occasionally read
//   `needed` slightly high and skip an enemy we could actually beat.
//   That's false-conservative, not unsafe; commits stay solid.
//   With MARGIN=0.45 (already tight) the survivor strength stays
//   ~MARGIN*BONUS=0.63, so RETAKE_VETO=1.5 still calibrates correctly.
// - Other reasonable lever (BACKING_WEIGHT 0.4 -> 0.5, g6_27c4e7's
//   trick) is left for a future hop. One change at a time.
export default {
  name: "Conqueror_g13_402951",
  author: "claude",
  version: 1,
  description: "g12_f23241 with 2 tech points re-allocated from def to atk; strategy code unchanged.",
  summary: `Parent Conqueror_g12_f23241 finished #5/#5/#2/#3/#3 across
season #123. Two of the bots that beat it (g6_27c4e7 at seed=229,
g6_ee139a at seed=224) embody two orthogonal one-knob deltas vs a
g11/g12 chassis:

  - g6_27c4e7: BACKING_WEIGHT 0.4 -> 0.5 (sharper hemisphere
    tiebreak in Pass 1).
  - g6_ee139a: tech 2 def -> 2 atk (match the bot's offense-first
    posture).

This descendant takes only the tech swap. Reasoning:
  1. The lineage prompt explicitly calls out tech as under-explored.
     Past descendants overwhelmingly preserved the parent's tech and
     tuned strategy; the cheap multiplier sits on the tech axis.
  2. g12's three passes are pure offense (Pass 1 hunts beatable
     adjacents with retake-aware + hemisphere scoring, Pass 2 grabs
     any adjacent action, Pass 3 walks toward the closest beatable
     stencil5 enemy). def=4 was paying for a posture this bot does
     not adopt; atk=6 amplifies the multiplier exercised every kill.
  3. g6_ee139a beat the parent with this exact swap on a
     structurally simpler offense-first chassis. g12 is more
     offensive than that cousin (tighter MARGIN, retake veto, retake
     scoring, walk-all-candidates Pass 3), so the gain should
     compose, not cancel.

Trade-off: BONUS=1.4 is a fixed kill-margin estimate, so a slightly
higher real combat ratio with atk=6 means tryCommit/Pass-1 may
over-read 'needed' a touch and skip an occasional kill. That is
false-conservative; commits stay safe and Pass 3 still finds the
next step. RETAKE_VETO=1.5 stays well-calibrated to the unchanged
MARGIN=0.45 survivor strength.

Holding off on g6_27c4e7's BACKING_WEIGHT bump deliberately - one
small change at a time so the season can attribute the result.
Strategy code is byte-identical to the parent.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 6, def: 2 },
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
