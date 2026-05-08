import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const TERRITORY_BIAS = 0.3;
// Parent g5 ran MARGIN=0.6. Two of the three bots that beat it in
// season #99 (Conqueror_g8_579783 directly, and the older sibling
// Conqueror_g4_de5d02 from which g8 inherited it) use MARGIN=0.45 in
// the same enemy/BONUS+MARGIN kill formula. The band
// [enemy/1.4+0.45, enemy/1.4+0.6) is full of attackPower values
// where the parent stalls but a 0.45-margin attack kills cleanly,
// and every successful kill also leaves an extra 0.15 strength on
// the home tile that compounds over the match. This is the most
// direct, single-constant tweak with head-to-head evidence.
const MARGIN = 0.45;

// One-constant descendant of Conqueror_g5_930cc7. Everything else is
// preserved verbatim: Pass 1 still ranks adjacent beatable enemies by
// enemy strength + 0.3 per friendly-owned neighbor (the territory
// bias that makes captures actually hold), and falls through to
// Conqueror.act when no kill is available. Hypothesis: the territory
// bias already mitigates the "free retake" concern that g8_579783
// patched with an explicit veto — captures with friendly backing
// don't flip back as easily — so we don't need the veto yet, and the
// tighter margin alone should pick up stalled kills without
// regressing.
export default {
  name: "Conqueror_g6_fbb329",
  author: "claude",
  version: 1,
  description: "g5_930cc7 with kill MARGIN tightened from 0.6 to 0.45.",
  summary: `Parent Conqueror_g5_930cc7 lost season #99 to three
descendants, two of which (g8_579783 and its ancestor g4_de5d02)
carry MARGIN=0.45 in place of the parent's MARGIN=0.6. Same
enemy/BONUS+MARGIN kill formula, one constant change. The band
[enemy/1.4+0.45, enemy/1.4+0.6) is full of attackPower values
where the parent stalls but a 0.45-margin attack kills cleanly,
and every successful kill also leaves an extra 0.15 strength on
the home tile.

Hypothesis: this is the cheapest improvement available to g5 with
direct head-to-head evidence. The parent's territory-bias kill
ranker already prefers captures with friendly backing — exactly
the captures least likely to be retaken — so the parent's chassis
should not need g8's explicit retake-veto to absorb the tighter
margin. Picking up kills the parent stalled on, while preserving
the bias, is a strict improvement under that assumption. Tech
unchanged at 90/0/2/4/4.`,
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
      let friendlyNbrs = 0;
      const tn = t.neighbors;
      for (let n = 0; n < 4; n++) {
        const nt = tn[n];
        if (nt && nt.ownerId === pid) friendlyNbrs++;
      }
      const score = enemy + TERRITORY_BIAS * friendlyNbrs;
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
