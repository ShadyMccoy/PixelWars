import Parent from "./Conqueror_g13_b41df9.js";

const BONUS = 1.4;
// Search radius for vulnerable enemy tiles. 3 keeps strikes
// meaningful given the budget cap; targets further than 3 tiles
// rarely have enough work-units delivered to win Lanchester
// cleanly under the cost-formula power*dist+1.
const RADIUS = 3;
// Keep at most this fraction of home strength out the door per
// snipe. Source tile stays defendable.
const MAX_SELF_COMMIT = 0.5;
// Don't waste a snipe on tiny enemies — adjacent fallback can
// pick those up cheaper without exposing the home.
const MIN_TARGET_STRENGTH = 2.5;
// Don't snipe at distance 1 — adjacent kill is the chassis's job
// and goes through hemisphere/territory scoring; range only adds
// value at distance 2+.
const MIN_DISTANCE = 1.5;

function hasAdjacentKill(neighbors, pid, sLimit) {
  for (let d = 0; d < 4; d++) {
    const t = neighbors[d];
    if (!t) continue;
    const tArmies = t.armies;
    let friendly = false;
    let enemy = 0;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) { friendly = true; break; }
      enemy += a.strength;
    }
    if (friendly) continue;
    if (enemy > 0 && enemy / BONUS + 0.45 <= sLimit) return true;
  }
  return false;
}

export default {
  name: "Sniper",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis + opportunistic ranged strike. Snipes only when (a) no adjacent kill available, (b) home tile has surplus strength, and (c) a vulnerable enemy is reachable for a clean Lanchester win — otherwise plays the validated chassis verbatim.",
  summary: `Earlier Sniper drafts replaced Conqueror's chassis tech
with high-move/low-prod loadouts to enable long shots. The chassis
fallback then ran with terrible tech and the bot underperformed
the lineage on the 90% of ticks where no snipe fired. Lesson: a
rule-aware bot should be a strict upgrade — keep the chassis tech
and gate the new behavior so it only fires when clearly beneficial.

Sniper now uses g14_8d5369's validated tech {move:76, stack:0,
prod:16, atk:5, def:3}. The chassis logic is g13_b41df9 (the
lineage's strategy parent). Sniper's only addition: before
deferring to the chassis, check whether a clean ranged shot
would beat the chassis's local action on the same tick.

Per army:
  1. If an adjacent beatable kill is on the table, defer to chassis
     immediately. The chassis's hemisphere/territory/retake-aware
     pick is more valuable than any snipe.
  2. No adjacent kill. Scan tiles at distance > 1, <= 3, for an
     enemy where:
       - enemy strength >= 2.5 (worth the +1 move overhead)
       - we can deliver minimum-Lanchester power with 1.0 raw
         strength surviving on the captured tile
       - that minPower <= 50% of our attackPower (keep home base)
       - the work cost (minPower*dist+1) fits in tile.budget * 0.7
  3. If a target qualifies, snipe with minPower exactly. Otherwise,
     defer to chassis.

Snipe only happens on idle frontier ticks where chassis has no
kill — those are the ticks where chassis would otherwise reinforce
a maxed friendly or take a low-value empty tile, both wasteful
under cost = power*dist+1. Sniping at range converts a wasted
overhead into a real kill.

Tech mirrors the chassis champion so the snipe path adds value
without taking any away.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    // Defer to chassis when an adjacent kill is on the table.
    if (hasAdjacentKill(neighbors, pid, sLimit)) {
      Parent.act(army, game);
      return;
    }

    // No adjacent kill — try a snipe.
    const atkMult = (army.player.techMults?.atk ?? 1) * BONUS;
    const w = game.map.width;
    const h = game.map.height;
    const budget = tile.budget;
    const workCap = budget * 0.7;
    if (workCap > 1) {
      let bestTarget = null;
      let bestScore = -Infinity;
      let bestPower = 0;
      const maxSelfCommit = sLimit * MAX_SELF_COMMIT;

      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          if (dx === 0 && dy === 0) continue;
          const distSq = dx * dx + dy * dy;
          if (distSq > RADIUS * RADIUS) continue;
          const dist = Math.sqrt(distSq);
          if (dist < MIN_DISTANCE) continue;
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
            if (a.player.id === pid) { friendly = true; break; }
            enemy += a.strength;
          }
          if (friendly) continue;
          if (enemy < MIN_TARGET_STRENGTH) continue;

          // Min Lanchester power that leaves >= 1.0 raw strength
          // on the captured tile. Add 1.1x safety margin.
          const minPower = Math.sqrt(1.0 + (enemy / atkMult) ** 2) * 1.1;
          // Cost formula: power * dist + 1. Max deliverable power
          // at this distance, given the work cap.
          const maxPowerByBudget = (workCap - 1) / dist;
          const ceiling = Math.min(maxPowerByBudget, maxSelfCommit, sLimit);
          if (minPower > ceiling) continue;

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
    }

    Parent.act(army, game);
  },
};
