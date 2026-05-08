import { sumStrength } from "../core/Army.js";
import Parent from "./Conqueror_g13_b41df9.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;
// New term: per empty neighbor of the kill target (excluding the
// source tile we're attacking from). Tuned conservatively so it's
// a tiebreaker on chassis-equivalent kills, not a value override.
const EMPTY_FLANK_W = 0.35;

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

export default {
  name: "Beachhead",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis with one Pass 1 scoring tweak: add a per-empty-flank bonus to kill scores. Captures that land with more empty neighbors create more next-tick frontage to expand into, compounding the kill's strategic value.",
  summary: `The chassis's Pass 1 picker scores beatable kills as
enemy + BACKING_WEIGHT*backing - RETAKE_W*backup + FRIENDLY_W*friend.
That balances the kill's local value against how exposed the
captured tile will be next tick. What it doesn't reward is how
many empty (no-army) neighbors the captured tile has — those are
free expansion options the bot will be able to take next tick at
cost = 1*power + 1, which is the cheapest kind of action available.

Beachhead adds + EMPTY_FLANK_W * empties, where empties is the
count of empty neighbors of the target tile (excluding the source
we're attacking from, which is friendly anyway after the move).
EMPTY_FLANK_W = 0.35 is small enough that it never overrides a
clear chassis preference (typical score deltas are 1-3 from the
enemy term) but large enough to break ties: when two kills are
otherwise equivalent, take the one that opens more frontline.

Why this should be a strict upgrade:
  - Empty flanks have no defender, so they will not resist next
    tick; the +1 move overhead for capturing them is the cheapest
    yield-per-strength action in the game.
  - The captured tile becomes the source for those expansions,
    so picking captures with more empty flanks chains kills into
    expansions naturally — same army, same neighborhood, same
    tick-to-tick continuity.
  - The chassis's existing terms are preserved verbatim. Beachhead
    only ADDS a non-negative term; ties go to better frontline
    geometry, but the chassis's anti-retake / hemisphere-backing
    safety stays in force.

Pass 2 (Conqueror.act fallback when no kill but other target) and
Pass 3 (stencil walk) are inherited unchanged. The thesis is local
to the kill picker.

Tech mirrors the chassis champion {move:76, stack:0, prod:16, atk:5,
def:3} so the score-tweak delta is isolated from any tech change.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
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
        let empties = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          if (ttArmies.length === 0) { empties++; continue; }
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
          + EMPTY_FLANK_W * empties;
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

    // No kill found — defer to the chassis for Pass 2 / Pass 3.
    // Beachhead's thesis is purely about kill-target picking;
    // expansion / reinforce / stencil-walk fallbacks stay verbatim.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }
    Parent.act(army, game);
  },
};
