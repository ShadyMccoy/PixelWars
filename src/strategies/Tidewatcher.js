export default {
  name: "Tidewatcher",
  author: "claude",
  version: 1,
  description:
    "Watches each neighbor's enemy strength over time and strikes only when it dips well below its observed peak — a freshly-spent stack.",
  summary: `Patience predator. Most "strike when weak" bots use absolute
thresholds (Opportunist: enemy < 0.5*self; Vampire: enemy + 1 < self).
Tidewatcher tracks the *temporal* signal instead — for each of the four
neighbor directions it remembers the peak enemy strength it has ever
observed there, and pounces when the current enemy stack has dropped to
< 60% of that peak. The intuition: an enemy that was full and is now
half-empty just spent strength attacking somewhere else, and the
attacking pieces are not coming back this tick. That's when neighbor
fights are cheapest.

Per-army state on \`army._peak\` is a Float32Array of length 4 (W, E, N,
S). On every tick we update the peak and look for at least one
direction where (a) current enemy is beatable with margin and (b)
current/peak < 0.6. We commit minimum-overkill (enemy + 1.0) so the
home tile keeps regenerating.

Fallbacks:
- If no neighbor has ever seen enemy presence (early game on a quiet
  flank), expand opportunistically into the weakest empty neighbor for
  a flat 1.2 — we don't want to sit motionless and forfeit territory.
- If all neighbors are friendlies or peakless and we're already at
  full strength, do nothing.

Loses to: bots that maintain *constant* pressure (Conqueror, Surge),
because their peak == current and the trigger never fires.
Wins against: Aggressive, Berserker, Vampire — bots whose strength
oscillates because they keep spending it on attacks.`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    if (!army._peak) army._peak = new Float32Array(4);
    const peak = army._peak;

    let bestIdx = -1;
    let bestEnemy = 0;
    let emptyTile = null;
    let emptyWeak = Infinity;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (emptyWeak > 0) {
          emptyTile = t;
          emptyWeak = 0;
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

      if (enemy > peak[i]) peak[i] = enemy;

      const beatable = enemy + 1.1 < army.strength;
      const dipped = peak[i] > 0 && enemy < peak[i] * 0.6;
      if (beatable && dipped && enemy > bestEnemy) {
        bestEnemy = enemy;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      army.attack(neighbors[bestIdx], bestEnemy + 1.0);
      return;
    }

    // No tide-strike available. Plant cheap flag on an empty if we have
    // surplus strength; otherwise wait.
    if (emptyTile && army.strength > 2.5) {
      army.attack(emptyTile, 1.2);
    }
  },
};
