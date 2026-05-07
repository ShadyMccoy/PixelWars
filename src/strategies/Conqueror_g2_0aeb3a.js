import Conqueror from "./Conqueror.js";
import { sumStrength } from "../core/Army.js";

// Parent (Conqueror_g1_879a88) keeps Conqueror's hardcoded BONUS = 1.4,
// but its tech ({move:90, stack:0, prod:2, atk:4, def:4}) gives atkMult
// = 0.952, so the real attacker bonus is 1.4 * 0.952 = 1.333. The
// formula `needed = enemy / 1.4 + 0.6` therefore under-commits versus
// neutral-def opponents (required is `enemy / 1.333`); the +0.6 margin
// just barely covers it, and against any def-leaning opponent the kill
// can flip into a lost army.
//
// This descendant fixes that by deriving the bonus from
// `army.player.techMults.atk` and also dividing by the target's
// `techMults.def` when the target tile has a single enemy. That makes
// the kill threshold tight against the *actual* matchup instead of an
// optimistic constant - less wasted strength per kill on weak
// opponents, no missed kills against def-tech opponents.
//
// Also adds a `weakestAdjacent` fallback for the case where every
// kernel-ranked direction was blocked (maxed friendlies / unbeatable
// enemies). Parent would idle that tick; we at least probe forward.

const BASE_BONUS = 1.4;

const KERNELS = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
];

const OFFSETS = KERNELS.map((k) => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const w = k[i][j];
      if (w !== 0) out.push(i * 5 + j, w);
    }
  }
  return out;
});

export default {
  ...Conqueror,
  name: "Conqueror_g2_0aeb3a",
  description: "Conqueror_g1_879a88 + tech-aware attacker-bonus and idle fallback.",
  summary: `Same kernels and selection order as Conqueror, same parent tech
({move:90, stack:0, prod:2, atk:4, def:4}). Two surgical fixes:

  1. Kill-sizing uses the real attacker bonus 1.4 * techMults.atk
     instead of the hardcoded 1.4. With the parent's atk=4 the real
     bonus is 1.333, so the parent's needed = enemy/1.4 + 0.6 was
     leaning on the +0.6 margin to avoid lost kills. Against any
     def-tech opponent that margin disappears. We also divide by the
     target's def mult when there is exactly one enemy on the tile,
     which tightens kill cost on soft targets and prevents undercut
     kills on hard ones.

  2. If every ranked direction was blocked (all friendlies near cap or
     all enemies unbeatable), parent idled. We fall back to
     weakestAdjacent() and probe forward with the full attackPower so
     a stranded interior army still does something each tick.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const neighbors = tile.neighbors;
    const pid = viewer.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const myAtk = (viewer.techMults && viewer.techMults.atk) || 1;
    const realBonus = BASE_BONUS * myAtk;

    const ranked = [];
    for (let k = 0; k < 4; k++) {
      if (!neighbors[k]) continue;
      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      ranked.push([score, k]);
    }
    ranked.sort((a, b) => b[0] - a[0]);

    for (let r = 0; r < ranked.length; r++) {
      const dir = ranked[r][1];
      const target = neighbors[dir];
      const armies = target.armies;

      let friendlyArmy = null;
      let enemyArmy = null;
      let enemyCount = 0;
      let enemy = 0;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) {
          friendlyArmy = a;
        } else {
          enemy += a.strength;
          enemyArmy = a;
          enemyCount++;
        }
      }

      if (friendlyArmy) {
        const cap = friendlyArmy.maxStrength;
        if (friendlyArmy.strength >= cap - 0.5) continue;
        const room = cap - friendlyArmy.strength;
        const want = (army.strength - friendlyArmy.strength) / 2;
        const power = Math.min(sLimit, room, Math.max(0.6, want));
        if (power > 0.5) {
          army.attack(target, power);
          return;
        }
        continue;
      }

      if (enemy > 0) {
        // Tech-aware kill threshold. With one enemy we can also
        // factor in their def mult (cleanly cancels out the realBonus
        // optimism on def-tech opponents); with mixed enemies we
        // conservatively skip the def correction.
        let needed;
        if (enemyCount === 1) {
          const dm = (enemyArmy.player.techMults && enemyArmy.player.techMults.def) || 1;
          needed = (enemy * dm) / realBonus + 0.4;
        } else {
          needed = enemy / realBonus + 0.6;
        }
        if (needed > sLimit) continue;
        army.attack(target, needed);
        return;
      }

      army.attack(target, sLimit);
      return;
    }

    // Fallback: nothing in the ranked list was viable. Probe the
    // weakest neighbor instead of wasting a tick.
    const fallback = army.weakestAdjacent();
    if (fallback) army.attack(fallback, sLimit);
  },
};
