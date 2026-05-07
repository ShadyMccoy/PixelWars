import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent Conqueror_g5_0b2647's interesting idea is the retake-aware
// Pass 1: among beatable adjacent enemies, score by
//   score = enemy - 0.5 * worst_backup_enemy
// instead of taking the strongest-beatable blindly. That tweak
// exists because with minimum-overkill (enemy/1.4 + 0.6) the
// survivor on the captured tile is ~0.4 strength, so a fat enemy
// stack on the tile's other neighbors retakes the tile next tick
// for free. Biasing toward stable captures preserves tempo.
//
// The kernel idea is sound on its face. What's killing the parent
// in season #73 isn't the kill-selection logic — it's the tech.
// Three of five recent losses (seeds 148, 119, 36) were to bots
// running noticeably more balanced tech allocations than the
// parent's 90/0/2/4/4. The most damning was seed=148, where
// Conqueror_g9_f7d113 (75/0/2/13/10) put the parent dead last
// (#6 of 6). g9_f7d113's design note already articulated the
// argument: with SLOPES.atk=0.0030 and SLOPES.def=0.0030, atk=4
// and def=4 sit at multiplier 0.952 — every attack lands ~5%
// below the formula's assumed bonus, and every defense absorbs
// ~5% less than baseline. On lab1 (30x22 wrap, growth 1.8,
// maxArmy 12) fights are long chains of small exchanges, so
// sub-baseline atk/def compounds into territorial loss.
//
// Meanwhile the marginal value of move=90 over move=75 is small:
// SLOPES.move=0.0100 with linear floor, so the garrison drops
// only from 0.75 (move 75) to 0.6 (move 90) — +0.15 strength of
// extra forward power, ~2.5% of a typical commit. The bot is
// already throwing essentially all its strength forward at
// move=75; the last 15 points are buying very little.
//
// THE CHANGE: pure tech rebalance to g9_f7d113's allocation
// (75/0/2/13/10). Kernel logic — including the retake-aware
// Pass 1 score = enemy - 0.5 * backup — is preserved
// byte-for-byte from the parent. This is a single-axis test:
// does the parent's retake-aware kill picker outperform
// g9's strongest-beatable picker when both run on the same
// balanced tech? If yes, the retake-aware tweak is validated as
// a real edge over plain strongest-beatable. If no, we know the
// tweak isn't paying for itself and the next descendant should
// drop it.
//
// We deliberately don't also add a Pass 3 stencil fallback
// (which g4_3fd4ce and g9_f7d113 carry) — the parent stalls on
// Conqueror.act in every non-kill case, and adding the stencil
// at the same time as the tech change would confound the signal.
// One axis at a time.
export default {
  name: "Conqueror_g6_20faee",
  author: "claude",
  version: 1,
  description: "g5_0b2647 retake-aware kernel verbatim with g9_f7d113's balanced tech (75/0/2/13/10).",
  summary: `Parent Conqueror_g5_0b2647 lost three recent matches
(seeds 148, 119, 36) to bots running materially more balanced tech
than the parent's 90/0/2/4/4. The most damning was seed=148, where
Conqueror_g9_f7d113 (75/0/2/13/10) put the parent dead last.

g9_f7d113's design note nails the diagnosis: atk=4 and def=4 sit at
multiplier 0.952 each, so every attack lands ~5% under the formula's
assumed bonus and every defense absorbs ~5% less than baseline. On
lab1 (30x22 wrap, growth 1.8, maxArmy 12) fights are long exchange
chains and the sub-baseline atk/def compounds into territorial loss.
Meanwhile move=90 over move=75 buys only +0.15 strength of extra
forward power per commit (~2.5%) — a poor trade for the atk/def gap.

This descendant is a pure tech-only change: kernel byte-for-byte
identical to the parent (retake-aware Pass 1 with score =
enemy - 0.5 * worst_backup_enemy, then Conqueror.act fallback),
tech adopts 75/0/2/13/10. Garrison floor moves from 0.6 to 0.75 —
still a large edge over the 1.4 neutral. atk goes 4 -> 13, def
4 -> 10, both still under the 20-anchor but close enough that the
per-fight penalty shrinks substantially.

Single-knob discipline: keeping the kernel fixed turns this match
into a clean A/B between retake-aware and strongest-beatable Pass 1
on the same tech, and leaves a clean baseline for a future kernel
tweak (e.g. adding a 5x5 stencil fallback) without the tech axis
confounding the signal.`,
  tech: { move: 75, stack: 0, prod: 2, atk: 13, def: 10 },
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

    let bestTile = null;
    let bestScore = -Infinity;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;

      // worst enemy stack on the target's other cardinal neighbors —
      // i.e. who can retake the tile next tick.
      let backup = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        let tnE = 0;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id !== pid) tnE += a.strength;
        }
        if (tnE > backup) backup = tnE;
      }

      const score = enemy - 0.5 * backup;
      if (score > bestScore) {
        bestScore = score;
        bestTile = t;
        bestNeeded = needed;
      }
    }

    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }
    Conqueror.act(army, game);
  },
};
