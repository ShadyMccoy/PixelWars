import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Don't burn the entire budget in one shot — leave headroom so we
// can act again next tick if a better target appears. 0.7 means each
// snipe spends at most 70% of available budget.
const BUDGET_FRACTION = 0.7;
// Search radius for vulnerable enemy tiles. Originally 5; v1's 60-bot
// pool eval found that at radius 5 the maximum deliverable power
// (cap * fraction / dist) is too small to kill anything past the
// opening few ticks. Radius 3 keeps strikes meaningful — at the
// budget-cap ceiling we can deliver ~6 strength at distance 3 vs ~3.6
// at distance 5 — and most useful targets are within a few tiles
// anyway on lab1's 30x22 map.
const RADIUS = 3;

export default {
  name: "Sniper",
  author: "claude",
  version: 1,
  description:
    "Long-range teleport bot: each tick scans a 5-tile radius for a vulnerable enemy tile, then teleports decisive force from this army's home tile to land a decisive Lanchester kill.",
  summary: `New ruleset (movementModel="budget", combatModel="lanchester")
unlocks a strategy no Conqueror cousin can replicate: ranged
teleport at non-adjacent targets. Sniper exploits this directly.

Per-army logic:
  1. Scan tiles within RADIUS=5 (Euclidean) for an enemy tile that
     this army can kill cleanly. The cost in work units (power x
     distance) is capped at BUDGET_FRACTION * tile.budget so we
     keep some recharge headroom for next tick.
  2. Among kill candidates, pick the one that maximizes
     (enemy_strength - 0.3 * distance) — score weights big targets
     higher and slightly penalizes far shots (more costly for the
     same delivered power).
  3. If the candidate's required commit (under Lanchester: enough
     to win cleanly given atk * BONUS attacker multiplier) fits in
     the budget-fraction work cap, teleport and return.
  4. Otherwise, fall through to Conqueror.act for local adjacent
     action — the chassis handles routine kills/expansion well.

Tech is offense-leaning: {move:50, stack:0, prod:10, atk:35, def:5}.
move:50 buys 1.6x recharge + 1.6x cap (so a fully-charged tile
holds 19 work units, enough for a 3-strength shot at distance 5
or a 5-strength shot at distance 3). atk:35 amplifies the
Lanchester compounding on every fight. def is dumped because
under Lanchester a bot with high atk wins ratio fights cleanly
and rarely needs to absorb a hit. prod stays modest because
Sniper's edge is about *where* you fight, not how much strength
you produce — overcommitting to prod would starve the move
budget that makes the strategy possible.

Expected to dismantle bots that stay locked in adjacent-only
play (the entire current lineage). Expected to lose to its
mirror or to other ranged bots that can counter-snipe.`,
  tech: { move: 50, stack: 0, prod: 25, atk: 20, def: 5 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;
    const myPid = army.player.id;
    const atkMult = (army.player.techMults?.atk ?? 1) * BONUS;
    const w = game.map.width;
    const h = game.map.height;
    const budget = tile.budget;
    const workCap = budget * BUDGET_FRACTION;

    // Hard rule: never commit more than half this army's strength to
    // a snipe. v1/v2 of Sniper sent full attackPower to remote
    // targets, leaving the source tile at ~0.5 strength — instant
    // kill by any adjacent enemy next tick. Keeping >=50% home
    // preserves the launch base.
    const maxSelfCommit = sLimit * 0.5;

    if (workCap <= 0.5) {
      Conqueror.act(army, game);
      return;
    }

    let bestTarget = null;
    let bestScore = -Infinity;
    let bestPower = 0;

    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const distSq = dx * dx + dy * dy;
        if (distSq > RADIUS * RADIUS) continue;
        const dist = Math.sqrt(distSq);
        const tx = ((tile.pos.x + dx) % w + w) % w;
        const ty = ((tile.pos.y + dy) % h + h) % h;
        const target = game.map.getTile(tx, ty);
        if (!target) continue;
        const tArmies = target.armies;
        if (tArmies.length === 0) continue;
        let friendly = false;
        let enemy = 0;
        for (let k = 0; k < tArmies.length; k++) {
          const a = tArmies[k];
          if (a.player.id === myPid) { friendly = true; break; }
          enemy += a.strength;
        }
        if (friendly) continue;
        // Don't waste a snipe on trivial enemies — adjacent fallback
        // can pick those up cheaper and without exposing the home.
        if (enemy < 2.0) continue;

        // Minimum-but-margin commit under Lanchester: pick the
        // smallest P such that sqrt((P*atkMult)^2 - enemy^2) leaves
        // us at least 1.0 raw strength on the captured tile after.
        // Closed form: P >= sqrt(1.0^2 + (enemy/atkMult)^2). Add a
        // 1.1x safety margin to absorb tile-defense or simultaneous
        // arrivals.
        const minPower = Math.sqrt(1.0 + (enemy / atkMult) ** 2) * 1.1;
        // Cap by all three constraints: budget at this distance, the
        // army's keep-half-home rule, and the army's strength.
        const maxPowerByBudget = workCap / dist;
        const ceiling = Math.min(maxPowerByBudget, maxSelfCommit, sLimit);
        if (minPower > ceiling) continue;

        // Score: prefer killing the biggest reachable enemy and
        // slightly prefer closer (cheaper, more reliable).
        const score = enemy - 0.3 * dist;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
          bestPower = minPower;
        }
      }
    }

    if (bestTarget) {
      army.attack(bestTarget, bestPower);
      return;
    }

    Conqueror.act(army, game);
  },
};
