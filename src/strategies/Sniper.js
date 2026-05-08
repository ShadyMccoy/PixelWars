import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Don't burn the entire budget in one shot — leave headroom so we
// can act again next tick if a better target appears. 0.7 means each
// snipe spends at most 70% of available budget.
const BUDGET_FRACTION = 0.7;
// Search radius for vulnerable enemy tiles. 5 covers most of lab1's
// 30x22 board within a reasonable scan, and the budget cap (12 *
// moveRecharge) limits useful range anyway.
const RADIUS = 5;

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
  tech: { move: 50, stack: 0, prod: 10, atk: 35, def: 5 },
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
    if (workCap <= 0.5) {
      // Budget too low for a meaningful snipe — defer to local play.
      Conqueror.act(army, game);
      return;
    }

    let bestTarget = null;
    let bestScore = -Infinity;
    let bestPower = 0;
    let bestDist = 0;

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
        if (tArmies.length === 0) continue; // empty — let Conqueror handle expansion
        let friendly = false;
        let enemy = 0;
        for (let k = 0; k < tArmies.length; k++) {
          const a = tArmies[k];
          if (a.player.id === myPid) { friendly = true; break; }
          enemy += a.strength;
        }
        if (friendly) continue;

        // Max raw power we can deliver at this distance with the
        // budget-fraction work cap. Also clamped by the army's own
        // sLimit (we can't send more strength than we have).
        const maxPowerByBudget = workCap / dist;
        const maxPower = maxPowerByBudget < sLimit ? maxPowerByBudget : sLimit;
        if (maxPower <= 0.5) continue;
        // Under Lanchester we need post-fight effective > 0 with
        // some margin. If maxPower * atkMult <= enemy, the fight is
        // a loss. Need a comfortable margin so we don't trade for
        // nothing.
        if (maxPower * atkMult <= enemy * 1.15) continue;

        const score = enemy - 0.3 * dist;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
          bestPower = maxPower;
          bestDist = dist;
        }
      }
    }

    if (bestTarget) {
      army.attack(bestTarget, bestPower);
      return;
    }

    // No good snipe — adjacent action via parent chassis.
    Conqueror.act(army, game);
  },
};
