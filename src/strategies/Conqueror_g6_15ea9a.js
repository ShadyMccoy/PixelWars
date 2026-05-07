import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const REACH_WEIGHT = 0.5;
// Parent used 0.6. Sibling Conqueror_g5_c09169 — one of the bots
// that beat the parent in season #51 — dropped this to 0.4 on a
// different g4 lineage and outranked its own parent. The lever is
// orthogonal to the parent's reach-weight scoring, so we stack both.
const MARGIN = 0.4;

// Parent Conqueror_g5_b3b641 added reach-weighted kill priority on
// top of g4_1f6790's "strongest beatable adjacent enemy" pre-pass.
// Loss log (season #51): 3 of 4 losses were to grandparent
// g4_1f6790; the 4th was to sibling g5_c09169.
//
// The 3-of-4 g4 losses suggest reach-weighting is, at best, a wash
// against the simpler strongest-only rule on lab1. That doesn't
// argue for ripping it out — sample is tiny and the positional
// argument is sound — but it does argue against piling more
// complexity on the same lever. The c09169 loss points at a cleaner
// orthogonal fix: MARGIN 0.6 → 0.4 in the kill formula
// `needed = enemy / BONUS + MARGIN`.
//
// Why MARGIN=0.4 is strictly better here:
//   - Post-kill surplus on the captured tile is `MARGIN * BONUS`
//     (rounding aside): 0.4 * 1.4 = 0.56, still positive ownership
//     with a small garrison, so the captured tile isn't insta-flipped.
//   - It opens kills the parent currently refuses: any beatable
//     enemy where `enemy/1.4 + 0.4 <= sLimit < enemy/1.4 + 0.6`
//     becomes reachable. These are exactly the near-parity seams
//     that decide long Membrane-pressure matches.
//   - Saves 0.2 strength at home per kill, compounding across the
//     long matches where parent's losses concentrate.
//
// Reach-weighted scoring is preserved unchanged — if it's neutral
// it's neutral, if it helps we keep the help. Tech 90/0/2/4/4
// unchanged; the move-heavy GA optimum still holds and is what
// makes the saved strength per kill actually matter (low garrison
// floor means more reserve to spend next tick).
export default {
  name: "Conqueror_g6_15ea9a",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_b3b641 with kill MARGIN reduced 0.6 -> 0.4; reach-weighted scoring and tech unchanged.",
  summary: `Parent g5_b3b641 lost 3-of-4 in season #51 to grandparent
g4_1f6790 (no reach weighting) and 1 to sibling g5_c09169 (reach
unchanged, MARGIN 0.6 -> 0.4 on a different g4 lineage). The first
pattern says reach-weighting is roughly a wash; the second points
at an orthogonal seam fix the parent never adopted. Adopt it here.

The kill pre-pass fires when needed = enemy/1.4 + MARGIN <= sLimit.
Lowering MARGIN from 0.6 to 0.4 opens the band of kills where
enemy/1.4 + 0.4 <= sLimit < enemy/1.4 + 0.6 — the near-parity
seams that decide long matches under Membrane-style pressure.
Post-kill surplus is still 0.4 * 1.4 = 0.56 (positive ownership,
small garrison), and 0.2 strength stays home per kill. Reach
weighting (REACH_WEIGHT=0.5) is preserved as a positional
tiebreaker in case it's actually contributing; if it's neutral,
the MARGIN cut still moves the needle on its own.

Tech unchanged at 90/0/2/4/4 — the move-heavy build is what makes
the per-kill strength savings exploitable on the next tick.`,
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
    let bestScore = -1;
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
      const needed = enemy / BONUS + MARGIN;
      if (needed > sLimit) continue;

      let friendlyReach = 0;
      const enbrs = t.neighbors;
      for (let n = 0; n < 4; n++) {
        const nt = enbrs[n];
        if (!nt) continue;
        const na = nt.armies;
        for (let k = 0; k < na.length; k++) {
          const a = na[k];
          if (a.player.id === pid) friendlyReach += a.strength;
        }
      }
      const score = enemy + REACH_WEIGHT * friendlyReach;
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
