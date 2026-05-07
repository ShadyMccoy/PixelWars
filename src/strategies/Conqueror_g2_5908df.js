import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Conqueror with Crusader-style explicit kill priority +
// rebalanced tech.
//
// Parent (Conqueror_g1_879a88) is plain Conqueror with extreme
// move tech (90/0/2/4/4). Three of its five recent losses are to
// bots that explicitly scan for the strongest winnable adjacent
// enemy first (Crusader_g1_352d0a, Stalker_g2_62478c) — and
// Crusader's published thesis is exactly that hybrid: kill the
// best winnable neighbor first, then fall through to Conqueror
// for territory expansion. Plain Conqueror.act sorts directions
// by Trinity-kernel alignment and only considers an enemy on the
// highest-aligned direction; if a beatable enemy sits adjacent
// in a low-aligned direction, Conqueror walks past it. We add a
// one-pass adjacent-kill scan up front and fall through to the
// kernel logic when no kill is available.
//
// Tech is also rebalanced. Parent's {move:90, stack:0, prod:2,
// atk:4, def:4} drives the garrison floor to 0.6 but pushes
// atk/def well below the baseline-20 anchor (every non-move
// knob is sub-baseline). Two of parent's five losses were
// max-ticks games — symptomatic of stalls where a small
// per-fight edge would have closed things out. Shift to
// {move:80, stack:0, prod:2, atk:10, def:8}: garrison still
// drops to 0.7 (a big throughput buff vs neutral 1.3), and
// atk/def move closer to baseline, narrowing the per-fight
// disadvantage against bots that buy them up.
export default {
  ...Conqueror,
  name: "Conqueror_g2_5908df",
  description: "Conqueror + Crusader-style kill priority + rebalanced atk/def tech.",
  summary: `Hybrid kill-then-flock. Pass 1: scan all 4 neighbors and
attack the strongest beatable adjacent enemy with minimum-overkill
(enemy/1.4 + 0.6). Pass 2: if no kill is available, fall through to
plain Conqueror's kernel-aligned act (friendly balance / empty grab /
aligned kill, walking the ranked direction list). Tech retreats from
parent's near-pure {move:90} into {move:80, prod:2, atk:10, def:8} to
restore some atk/def at the cost of 0.1 garrison. Targets the loss
patterns vs Crusader_g1_352d0a (max-ticks) and Stalker_g2_62478c
(max-ticks): both winners explicitly prioritize the strongest
winnable kill, and both ground out long games on per-fight edges
parent had spent away.`,
  tech: { move: 80, stack: 0, prod: 2, atk: 10, def: 8 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    // Pass 1: strongest beatable adjacent enemy.
    let bestKill = null;
    let bestEnemy = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestEnemy / BONUS + 0.6);
      return;
    }

    // Pass 2: Conqueror's kernel-based territory logic.
    Conqueror.act(army, game);
  },
};
