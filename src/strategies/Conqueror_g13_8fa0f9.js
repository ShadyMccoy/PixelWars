import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

// Single targeted change vs parent Conqueror_g12_f23241: tech is
// reallocated from {move:90, stack:0, prod:2, atk:4, def:4} to
// {move:80, stack:0, prod:12, atk:4, def:4}.
//
// Why this change, why now:
//
//   - Two of the three bots that beat the parent in season #124
//     (g9_e06b76 and g10_cbab8a) had moved 10 points OUT of move
//     and into prod/stack. The third (g11_755fa9) kept the parent's
//     tech but had a much simpler-and-tighter Pass 1 score. Of the
//     three, g10_cbab8a is the closest analog to this lineage:
//     same hemisphere-weighted retake-aware Pass 1 chassis, same
//     atk:4/def:4 floor, and explicitly the same "MARGIN=0.45 makes
//     prod worth more" thesis the parent already runs.
//
//   - The spawner flags tech as under-explored, and it's true: this
//     branch has held {move:90, prod:2} fixed for ten generations
//     while only tuning Pass 1 weights. The kill picker is now
//     state-of-the-art (retake-aware + free-retake veto + hemisphere
//     backing). The remaining lever is supply.
//
//   - With MARGIN tightened to 0.45, parent burns ~0.15 less strength
//     per kill than the MARGIN=0.6 ancestors did. That makes a larger
//     fraction of produced strength deployable per tick - production
//     is strictly more valuable in this branch's world than it was at
//     the {move:90, prod:2} basin's original tuning.
//
//   - move:90 is well past saturation for lab1 (30x22, maxArmy 12,
//     wrap). Dropping to 80 still keeps the garrison floor above what
//     the strategy actually drains per tick. atk and def are kept at
//     4/4 because BONUS=1.4 is hardcoded into all needed-strength math
//     and Pass 3 reachability; perturbing atk would either waste
//     surplus or under-commit on the edge-of-band kills MARGIN=0.45
//     was added to capture.
//
// Hypothesis: The parent's Pass 1 logic is already best-in-lineage on
// kill *priority*, but it doesn't have enough kills to make per-tick.
// Same brain, more bullets. If this regresses, the takeaway is that
// move:90 is load-bearing for late-game garrison reactivity on this
// map and the next iteration should try +5 prod instead of +10.
//
// All strategy code below is byte-identical to the parent.

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
  name: "Conqueror_g13_8fa0f9",
  author: "claude",
  version: 1,
  description: "Parent Conqueror_g12_f23241 with 10 tech points moved from move (90->80) into prod (2->12). Strategy code unchanged.",
  summary: `Strategy code is byte-identical to parent
Conqueror_g12_f23241. The only change is tech: {move:90, stack:0,
prod:2, atk:4, def:4} -> {move:80, stack:0, prod:12, atk:4, def:4}.

Why tech and not strategy code:

The parent's Pass 1 already runs the strongest kill-priority logic
in this lineage - hemisphere-weighted backing, retake-aware backup
penalty, friendly-support reward, plus a hard veto on free-retake
captures. All three improvements were lifted from sibling bots
that beat earlier ancestors. There is little obvious headroom in
the kill picker itself.

Where there IS obvious headroom is tech. This branch held
{move:90, prod:2} fixed for ten generations while tuning Pass 1
weights. Two of the three bots that beat the parent in season #124
(g9_e06b76 and g10_cbab8a) had explicitly moved 10 points OUT of
move into prod/stack. g10_cbab8a is the cleanest analog -
hemisphere-weighted retake-aware Pass 1 chassis, atk:4/def:4 floor,
and explicitly the "MARGIN=0.45 makes prod worth more" thesis that
this lineage already runs.

The argument transfers directly: with MARGIN=0.45, parent burns
~0.15 less strength per kill than its MARGIN=0.6 ancestors. A
larger share of produced strength is deployable per tick, so
prod's marginal value rose exactly as the lineage approached this
generation. Meanwhile move:90 is well past saturation on lab1
(30x22, maxArmy 12, wrap); dropping to 80 still keeps the garrison
floor above what the strategy drains per tick.

atk and def are pinned at 4/4 because BONUS=1.4 is hardcoded into
Pass 1 admission, tryCommit, and Pass 3 reachability. Perturbing
atk would either waste committed strength or under-commit on the
edge-of-band kills MARGIN=0.45 was added to capture - and that's
a separate experiment.

Failure mode: prod's slope may be sub-linear and +10 points buys
less than expected, while move:80 occasionally falls short during
late-game contested-tile reactivity bursts. If it regresses, the
next iteration should try +5 prod (move:85, prod:7) instead of
+10, isolating slope from saturation.`,
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
