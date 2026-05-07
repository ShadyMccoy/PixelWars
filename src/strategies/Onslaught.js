import { sumStrength } from "../core/Army.js";

const ATTACKER_BONUS = 1.4;

// Three-in-a-row kernels (same as Trinity). Used as a tiebreaker bias
// across all action types so our armies still flock when picking targets,
// rather than each picking independently and dispersing the punch.
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
      if (k[i][j] !== 0) out.push(i * 5 + j, k[i][j]);
    }
  }
  return out;
});

// Score weights per target class. Larger numbers dominate alignment ties;
// alignment is added as a fractional bonus so it only breaks ties within a
// class. Empties beat suicides because expansion compounds, but a clean
// kill always beats either.
const KILL_BASE = 1000;
const EMPTY_BASE = 500;
const SUICIDE_BASE = 50;
const ALIGN_WEIGHT = 0.5;

export default {
  name: "Onslaught",
  author: "claude",
  version: 1,
  description: "Always attacks. Trades freely on saturated borders by exploiting the 1.4x attacker bonus, flocks like Trinity to coordinate the punch.",
  summary: `Stalemate-breaker. Most bots use \`enemy + 1 < strength\` as their
"can I win?" gate, which makes a saturated 12-vs-12 border look unwinnable
and the match settles into a colonized draw. But the engine grants
attackers a 1.4x bonus, so committing attackPower=11 from a 12-strength
tile actually projects 15.4 effective strength — enough to overwhelm a
12-defender, kill it, and survive on the captured tile. Onslaught notices
that and refuses to settle.

Each tick we score the four directions and commit full attackPower into
the highest-scoring one:
  - Beatable enemy (myEff > enemy):  base 1000, the clean kill.
  - Empty tile:                      base 500, expansion compounds.
  - Unbeatable enemy (suicide):      base 50, only above 70% of cap.
    Suicide is a 1.4x trade in our favor (we deal myEff damage while
    losing myEff/1.4 of strength), and the surviving defender is soft
    for our next army to finish off. The 70% gate keeps us from
    throwing seed armies before borders form.
  - Friendly tile:                   skipped (own no-op).
A Trinity-style alignment bonus (knight-kernel friendly density) is
folded into every score so all our armies pick the same axis when the
top-class targets tie. Without that bonus each army picks
independently and the punch disperses; with it Onslaught flocks like
Trinity but keeps shoving even after the saturated equilibrium that
makes Trinity stop.

When no direction has any target (all four are friendly or off-map), we
still march in the highest-aligned direction so an enclosed army bleeds
outward through the friendly stack.`,

  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const pid = army.player.id;
    const attackPower = army.attackPower;
    if (attackPower <= 0.5) return;
    const myEff = attackPower * ATTACKER_BONUS;
    const allowSuicide = army.strength >= army.maxStrength * 0.7;

    // Precompute Trinity alignment per direction (friendly knight-density).
    const align = [0, 0, 0, 0];
    if (stencil) {
      for (let k = 0; k < 4; k++) {
        const offs = OFFSETS[k];
        let s = 0;
        for (let n = 0; n < offs.length; n += 2) {
          const t = stencil[offs[n]];
          if (!t) continue;
          s += offs[n + 1] * sumStrength(t.armies, viewer);
        }
        align[k] = s;
      }
    }

    let bestDir = -1;
    let bestScore = -Infinity;
    let bestFallbackDir = -1;
    let bestFallbackAlign = -Infinity;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) {
          friendly = true;
          break;
        }
        enemy += a.strength;
      }
      // Friendlies count as fallback-only marches (we'd waste strength
      // attacking our own tile cap). Track best alignment so a fully
      // enclosed army still picks a flocking direction.
      if (friendly) {
        if (align[i] > bestFallbackAlign) {
          bestFallbackAlign = align[i];
          bestFallbackDir = i;
        }
        continue;
      }

      let base;
      if (enemy === 0) {
        base = EMPTY_BASE;
      } else if (myEff > enemy) {
        // Stronger beatable enemies score higher within the kill class:
        // clearing the biggest local threat compounds.
        base = KILL_BASE + enemy;
      } else if (allowSuicide) {
        // Tighter trades (myEff/enemy closer to 1) deal more absolute
        // damage and leave a softer survivor — prefer those.
        base = SUICIDE_BASE * (myEff / enemy);
      } else {
        // Below the suicide gate, the unbeatable enemy is just a wall.
        // Treat it as a fallback-only march candidate.
        if (align[i] > bestFallbackAlign) {
          bestFallbackAlign = align[i];
          bestFallbackDir = i;
        }
        continue;
      }

      const score = base + ALIGN_WEIGHT * align[i];
      if (score > bestScore) {
        bestScore = score;
        bestDir = i;
      }
    }

    if (bestDir < 0) bestDir = bestFallbackDir;
    if (bestDir < 0) return;
    army.attack(neighbors[bestDir], attackPower);
  },
};
