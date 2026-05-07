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
// kill always beats either. The focus bonus is bigger than the gap
// between classes so a focus-enemy suicide outranks an empty tile when
// it lets us pile pressure on one neighbor instead of spreading thin.
const KILL_BASE = 1000;
const EMPTY_BASE = 500;
const SUICIDE_BASE = 50;
const FOCUS_BONUS = 600;
const ALIGN_WEIGHT = 0.5;

export default {
  name: "Empire",
  author: "claude",
  version: 1,
  description: "Always attacks. Trades freely on saturated borders by exploiting the 1.4x attacker bonus, flocks like Trinity to coordinate the punch.",
  summary: `Stalemate-breaker. Most bots use \`enemy + 1 < strength\` as their
"can I win?" gate, which makes a saturated 12-vs-12 border look unwinnable
and the match settles into a colonized draw. But the engine grants
attackers a 1.4x bonus, so committing attackPower=11 from a 12-strength
tile actually projects 15.4 effective strength — enough to overwhelm a
12-defender, kill it, and survive on the captured tile. Empire notices
that and refuses to settle.

Each tick we score the four directions and commit full attackPower into
the highest-scoring one:
  - Beatable enemy (myEff > enemy):  base 1000, the clean kill.
  - Empty tile:                      base 500, expansion compounds.
  - Unbeatable enemy (trade):        base 50 * (myEff/enemy). Still a
    1.4x trade in our favor — we deal myEff damage while losing
    myEff/1.4 mass. Attack-1 may not change territory, but it leaves a
    soft survivor for attack-2 to capture. With more territory and
    growth on our side the war of attrition wins even when individual
    battles don't.
  - Friendly tile:                   skipped (own no-op).
On top of all that, any tile owned by our "focus enemy" (the living
non-self player with the least territory) gets a +600 bonus. Pacifist
turtles tend to surround us symmetrically; without focus, our armies
attack three different turtles simultaneously and convert to zero
kills. Focus collapses the cascade onto one player at a time, and
eliminating a player compounds — fewer rivals = more uncontested space
for everyone left, including us.

A Trinity-style alignment bonus (knight-kernel friendly density) is
folded into every score so all our armies pick the same axis when the
top-class targets tie. Without that bonus each army picks
independently and the punch disperses; with it Empire flocks like
Trinity but keeps shoving even after the saturated equilibrium that
makes Trinity stop.

Cap discipline: a march through a friendly tile only fires if the
friendly has headroom, and the commitment is capped at that headroom.
Pumping attackPower into a maxed-out neighbor clamps to zero growth
and bleeds the source for nothing — better to sit at cap (zero cost)
than overpay an internal transfer.

When no direction has any target (all four are friendly or off-map), we
still march in the highest-aligned direction so an enclosed army bleeds
outward through the friendly stack.`,

  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const pid = army.player.id;
    const attackPower = army.attackPower;
    if (attackPower <= 0.5) return;
    const myEff = attackPower * ATTACKER_BONUS;

    // Focus enemy: concentrate on whichever non-self living player has the
    // least territory. Two reasons:
    //   - reducing the player count compounds (1 fewer rival = more
    //     uncontested space for everyone left, including us)
    //   - turtles distribute around us, and spreading attacks across
    //     three pacifist neighbors converts to no kills against any of
    //     them. Picking one and grinding it down trades evenly into a
    //     real elimination.
    // Ties broken by lowest strength so we finish off whoever is closest
    // to dead. If we're somehow tied for last, focusId stays -1 and the
    // bot just plays its base scoring.
    let focusId = -1;
    let focusTerr = Infinity;
    let focusStr = Infinity;
    if (game && game.players) {
      const players = game.players.list;
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p.id === pid) continue;
        const totals = p.totals;
        if (!totals || totals.armies === 0) continue;
        const terr = totals.territory ?? 0;
        const str = totals.strength ?? 0;
        if (terr < focusTerr || (terr === focusTerr && str < focusStr)) {
          focusTerr = terr;
          focusStr = str;
          focusId = p.id;
        }
      }
    }

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
    let bestFallbackRoom = 0;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      let hasFocus = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) {
          friendly = true;
          break;
        }
        enemy += a.strength;
        if (a.player.id === focusId) hasFocus = true;
      }
      // Friendlies are fallback-only marches: we'd rather attack an
      // enemy (1.4x trade) than transfer through our own tiles. Skip
      // any friendly that's already near cap — sending strength into a
      // capped friendly clamps to zero growth, so the source loses
      // strength and the friendly gains nothing. Sitting at cap costs
      // less than a wasted transfer.
      if (friendly) {
        const ally = armies[0];
        if (ally && ally.strength < ally.maxStrength - 0.5) {
          if (align[i] > bestFallbackAlign) {
            bestFallbackAlign = align[i];
            bestFallbackDir = i;
            bestFallbackRoom = ally.maxStrength - ally.strength;
          }
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
      } else {
        // Unbeatable enemy: still a 1.4x trade in our favor (we deal myEff
        // damage and lose myEff/1.4 mass). One attack alone may not change
        // territory, but the *next* attack lands on a soft survivor. With
        // territory advantage the cascade always wins. No strength gate —
        // sitting still on a saturated border is worse than a 1.4x trade.
        // Tighter ratios still preferred (more absolute damage per swing).
        base = SUICIDE_BASE * (myEff / enemy);
      }

      // Focus-enemy bonus: when several pacifist neighbors surround us,
      // attacking all three at once converts to no kills. Piling on one
      // converts to an elimination.
      if (hasFocus) base += FOCUS_BONUS;

      const score = base + ALIGN_WEIGHT * align[i];
      if (score > bestScore) {
        bestScore = score;
        bestDir = i;
      }
    }

    if (bestDir >= 0) {
      army.attack(neighbors[bestDir], attackPower);
      return;
    }
    if (bestFallbackDir >= 0) {
      // Marching through a friendly: cap the transfer at the friendly's
      // remaining headroom so we don't bleed strength into a no-op.
      const power = Math.min(attackPower, bestFallbackRoom);
      if (power > 0.5) army.attack(neighbors[bestFallbackDir], power);
    }
    // No enemy, no empty, every friendly is at cap — sit. Standing at
    // cap costs ~0; transferring into a capped tile is pure loss.
  },
};
