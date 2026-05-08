import { sumStrength } from "../core/Army.js";

const BONUS = 1.4;
const MARGIN = 0.45;

// Trinity-style alignment kernels (unchanged from parent).
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
  name: "Conqueror_g6_c4c8d1",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_b451ab with tech rebalanced from def into atk to match the bot's offensive posture.",
  summary: `Strategy code is identical to the parent — same MARGIN=0.45,
same Trinity kernels, same friendly balancing, same max-commit on
empty tiles. The only change is tech allocation: 2 points moved from
def into atk (atk: 4→6, def: 4→2).

Hypothesis: this lineage's tech has been near-frozen for many gens
while the strategy doubled down on aggression. The g5 author noted
the bot's whole identity is "don't waste strength" and explicitly
celebrated the +0.15 left over per kill. But that ethos is being run
on tech that splits offense and defense evenly. Conqueror with
move=90 spends almost every tick attacking, and tryCommit only fires
on enemy or empty neighbors — defensive engagements are rare.
Trading 2 def → 2 atk amplifies the per-tick output that the
strategy actually exercises, at the cost of a multiplier that almost
never resolves.

The parent dominated season #104 with no recorded losses, so this is
a margin-amplification bet, not a fix for a known weakness: the
strategy was already winning, this should let it win a bit harder
per kill (and propagate through the +0.15 surplus the parent banked
on every engagement). If atk slope behaves linearly, a 50% bump on
atk is a meaningful free multiplier on the bot's signature move.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 6, def: 2 },
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

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
      let enemy = 0;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
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
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;
        army.attack(target, needed);
        return;
      }

      army.attack(target, sLimit);
      return;
    }
  },
};
