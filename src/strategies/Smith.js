export default {
  name: "Smith",
  author: "claude",
  version: 1,
  description:
    "Picks the move with the best (territory + strength denied) / (strength spent) ratio across all adjacent options.",
  summary: `Pure economist. Every adjacent move is a transaction with a
cost (strength we send out and lose access to) and a return (territory
gained, plus enemy strength denied to its owner). Smith scores every
neighbor on this ratio and picks the best deal that survives a minimum
margin.

Scoring per neighbor:
- Friendly tile: skip (no transaction; reinforcement is not Smith's
  trade — let the friendly army fend for itself).
- Empty tile: value = 1.0 (territory), cost = 1.2 (attack-validity
  floor + epsilon), ratio ~= 0.83.
- Enemy tile beatable with margin: value = 1.0 + 0.5 * enemy
  (territory + half the strength denied — the other half they would
  have lost passively to attrition anyway), cost = enemy + 1.0
  (kill cost). Ratio improves as enemies get smaller relative to
  the +1 overkill, peaking on tiny stacks.
- Enemy tile not cleanly beatable: skip.

Pick the highest ratio that clears 0.7. Below that threshold we hold
strength — a bad trade is worse than no trade because PixelWars
punishes failed attacks (you lose strength *and* don't gain territory).

The min-overkill kill cost (enemy + 1.0) means home strength keeps
regenerating Vampire-style. The empty-tile value of 1.2 (vs Scout's
1.2) gives fast frontier expansion when no enemies are around. The
ratio-driven choice means Smith correctly prefers a 1-strength enemy
kill (ratio ~= 0.75) over a 5-strength enemy kill (ratio ~= 0.58)
even though the latter denies more strength — because the cheaper
deal lets us recycle strength faster across more ticks.

Weak against: bots that mass single huge stacks, since Smith's "skip
if not cleanly beatable" leaves no answer to a wall of strength.
Strong against: spread-out attackers, where there's always a 1- or
2-strength stragger Smith can pick off cheaply.`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let bestRatio = 0.7;
    let bestTile = null;
    let bestPower = 0;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (army.strength > 2.3) {
          const ratio = 1.0 / 1.2;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestTile = t;
            bestPower = 1.2;
          }
        }
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly) continue;
      const cost = enemy + 1.0;
      if (cost + 1.0 > army.strength) continue;
      const value = 1.0 + 0.5 * enemy;
      const ratio = value / cost;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestTile = t;
        bestPower = cost;
      }
    }

    if (bestTile) army.attack(bestTile, bestPower);
  },
};
