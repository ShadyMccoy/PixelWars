import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.2;
// Hypothesis (one knob): add TERRITORY_BIAS to Pass 1 score.
//
// Why this should help:
//   - The parent (g14_2ae72f) tightened RETAKE_VETO to 1.2 to fix
//     tempo-negative trades, but season #132 still shows the same
//     tail collapses: seed=120 finished #6 of 6 and seed=227 finished
//     #5 of 6. Two of the five recent losses were direct head-to-head
//     defeats by Conqueror_g9_5c4555 (seeds 120 and 129).
//   - g9_5c4555's distinguishing feature vs this lineage is exactly
//     ONE term we don't have: TERRITORY_BIAS = 0.3 * (friendly-owned
//     count among target's cardinal neighbors). It biases captures
//     toward consolidating existing territory rather than poking
//     salients into hostile space. That's a structurally orthogonal
//     lever to everything in the parent's score:
//       enemy        - target's adjacent strength (raw threat)
//       backing      - hemisphere depth behind the kill (g8_3280dd)
//       backup       - single biggest enemy on a target neighbor
//       friend       - single biggest friendly on a target neighbor
//       (NEW) ownership count of target's neighbors
//     The first four are army-strength signals on a 5x5 stencil;
//     ownership is a tile-level signal that asks a different
//     question — "if I take this tile, do I get a connected pocket
//     or a fragile spike?"
//   - On lab1's 30x22 wrap with growth=1.8 and maxArmy=12, salient
//     captures are precisely what feeds the late-game collapse: a
//     tile poking into enemy territory has up to 3 hostile neighbors
//     all able to retake-and-keep on subsequent ticks, even when
//     RETAKE_VETO blocks the immediate one. Consolidation captures
//     have at most 1-2 hostile neighbors, so the same backup army
//     can only reach them through fewer angles. With the parent's
//     prod=12 buying ~10-15% extra deployable strength per tick, we
//     have enough surplus to *prefer* the consolidation kill when
//     two adjacent options are otherwise comparable — TERRITORY_BIAS
//     just reorders comparable kills, never overrides a clearly
//     better one (max +1.2 vs typical enemy=2-4 dominating).
//   - The change is structurally additive: the enemy, backing,
//     backup, and friend terms still vote first; ownership only
//     swings the choice among kills that already cleared admission
//     and have similar strength rankings. RETAKE_VETO=1.2 still
//     refuses the free-retake band; the new term just tilts the
//     surviving candidates toward sticky territory shapes.
//
// Mechanics:
//   - In the existing target-neighbor scan (already iterating tn[j]
//     for backup/friend), additionally count friendlyOwners where
//     tn[j].ownerId === pid. Following g9_5c4555's pattern, the
//     iteration does NOT skip tile itself (the attacking tile is
//     always one of target's neighbors and always friendly-owned),
//     so the count includes a constant +1 from the attacker — that
//     is just a uniform offset across all candidate targets and does
//     not affect relative ranking.
//   - Score formula adds + TERRITORY_BIAS * friendlyOwners. Value
//     0.3 is taken directly from g9_5c4555 unchanged: it beat this
//     parent in season #132 and tuning two things at once would
//     blur the signal.
//
// Tech is unchanged at {move:80, stack:0, prod:12, atk:4, def:4}.
// The parent's recipe has not been refuted on the tech axis; this
// change is strictly Pass 1 target ranking.
const TERRITORY_BIAS = 0.3;

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
  name: "Conqueror_g15_8c3a18",
  author: "claude",
  version: 1,
  description: "Conqueror_g14_2ae72f + TERRITORY_BIAS=0.3 (the lever that distinguishes g9_5c4555, which beat the parent in seasons #132 seeds 120 and 129).",
  summary: `Parent Conqueror_g14_2ae72f tightened RETAKE_VETO to 1.2
to refuse free-retake kills, but season #132 still shows tail
collapses (seed=120 #6 of 6, seed=227 #5 of 6). Two of the five
recent losses are direct head-to-head defeats by
Conqueror_g9_5c4555 (seeds 120 and 129).

g9_5c4555's distinguishing term is TERRITORY_BIAS — score the
target by how many of its cardinal neighbors are friendly-owned,
biasing captures toward consolidating territory rather than poking
salients. That signal is structurally orthogonal to the parent's
existing Pass 1 levers (enemy/backing/backup/friend are all
army-strength on a 5x5 stencil; ownership is a tile-level shape
question).

Single change: add + 0.3 * friendlyOwners to the Pass 1 score
inside the existing target-neighbor scan. Following g9_5c4555's
pattern, the iteration does not skip the attacking tile — that just
adds a constant +1 across all candidates and doesn't shift
ordering. Max swing is +1.2 vs typical enemy=2-4 dominating, so the
new term reorders kills that are already comparable, it does not
override a clearly stronger candidate. RETAKE_VETO=1.2 still
refuses the free-retake band.

On lab1's 30x22 wrap with growth=1.8 and maxArmy=12, salient
captures are exactly what feeds late-game collapses (a poked tile
has up to 3 hostile neighbors that can sequentially retake even
when the immediate retake is vetoed). Consolidation captures have
fewer hostile angles, so the same backup army can only reach them
from fewer directions.

Tech is unchanged at {move:80, stack:0, prod:12, atk:4, def:4} —
this is a Pass 1 ranking change only, and tuning two axes at once
would blur the signal.`,
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
        let friendlyOwners = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt) continue;
          if (tt.ownerId === pid) friendlyOwners++;
          if (tt === tile) continue;
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
          + FRIENDLY_W * friend
          + TERRITORY_BIAS * friendlyOwners;
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
