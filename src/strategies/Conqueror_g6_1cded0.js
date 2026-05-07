import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const RETAKE_W = 0.8;     // up from g5's 0.5 — backup matters more
const FRIENDLY_W = 0.4;   // new — reward salient/sticky captures
const RETAKE_VETO = 1.8;  // refuse when backup will trivially retake

// Parent g5 added retake-aware kill scoring but the 0.5 weight is
// only a tiebreaker — pyrrhic kills still happen whenever the
// on-top enemy is largest. Two refinements layered on top:
//
// 1. Hard veto on free-retake captures. With minimum overkill, the
//    survivor on the captured tile is ~0.84 strength (0.6 * 1.4).
//    Any enemy stack of ~1.8+ on an adjacent tile can retake at
//    minimum cost (needed = 0.84/1.4 + 0.6 = 1.2). g5 *biased*
//    against these; we *skip* them. The cost of skipping is mild
//    — the army falls through to Conqueror.act, which still makes
//    a sensible kernel-driven move — and it stops the bot from
//    repeatedly handing pixels back to the same neighbor.
//
// 2. Friendly-backup reward. A capture into a tile where we
//    already have friendly armies on other neighbors is sticky:
//    the friendly stack pressures any backup enemy and can
//    reinforce next tick. We add 0.4 * best_friendly to the
//    score so, all else equal, we capture into our own salient
//    rather than a stranded pixel.
//
// 3. Backup weight bumped 0.5 → 0.8. With neutral-tech enemies
//    (~1.3 garrison floor) a backup of 1.5+ can already commit a
//    retake attack; weighting it more heavily makes the score
//    function actually pick the safer kill, not just nudge it.
//
// Tech and overkill unchanged from g5 — same move-heavy reserve
// thesis, just spends less of the reserve on doomed captures.
export default {
  name: "Conqueror_g6_1cded0",
  author: "claude",
  version: 1,
  description: "g5 with stronger backup penalty, friendly-backup reward, and a hard veto on free-retake captures.",
  summary: `g5 introduced retake-aware kill priority but the 0.5
backup penalty was just a tiebreaker — pyrrhic kills still went
through whenever the on-top enemy was largest, and we kept handing
back tempo on tiles whose backups had ample strength to retake.
Three refinements:
 (a) Hard veto: skip captures where the worst backup enemy is
     >= 1.8. With minimum overkill the survivor is only ~0.84,
     and a 1.8+ neighbor retakes for ~1.2 strength next tick.
     These captures are tempo-negative, period — don't take them.
 (b) Friendly-backup reward: +0.4 * best_friendly on the target's
     other neighbors, so captures into our own salient win ties
     over isolated kills. Small enough that it never overrides
     a genuinely valuable but lonely kill.
 (c) Backup weight 0.5 -> 0.8 so the score function actually
     selects the safer kill instead of merely nudging it.
Tech, overkill, and the Conqueror fallback are unchanged.`,
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

      // Scan target's other cardinal neighbors for both the worst
      // enemy stack (retake threat) and the best friendly stack
      // (sticky-capture support).
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

      // Free-retake veto: survivor ~0.84, backup >= 1.8 will walk
      // the tile back at minimum cost. Always tempo-negative.
      if (backup >= RETAKE_VETO) continue;

      const score = enemy - RETAKE_W * backup + FRIENDLY_W * friend;
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
