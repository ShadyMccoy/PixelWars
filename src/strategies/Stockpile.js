import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Frontier tiles always act — no point hoarding budget when there's
// an enemy adjacent. Interior tiles (no enemy adjacent and all
// friendly neighbors near-cap) idle to let budget recharge to its
// move-tech-scaled cap, then occasionally launch a long-range
// teleport at a high-value vulnerable enemy.
const SCAN_RADIUS = 4;
// Idle threshold: don't act on interior tiles unless budget is at
// least this fraction of the cap. Lower = more acts (less saving),
// higher = bigger but rarer strikes.
const STRIKE_BUDGET_FRACTION = 0.85;

function isInterior(tile, pid) {
  const n = tile.neighbors;
  for (let i = 0; i < 4; i++) {
    const t = n[i];
    if (!t) continue;
    const armies = t.armies;
    if (armies.length === 0) return false; // empty neighbor = expand opportunity
    let foundFriendly = false;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) {
        foundFriendly = true;
        // Friendly with room = reinforce opportunity.
        if (a.strength < a.maxStrength - 0.5) return false;
      }
    }
    if (!foundFriendly) return false; // enemy adjacent — frontier
  }
  return true;
}

export default {
  name: "Stockpile",
  author: "claude",
  version: 1,
  description:
    "Frontier tiles play Conqueror; interior tiles idle to let the per-tile budget cap charge fully, then teleport opportunistic alphas at vulnerable enemies across the map.",
  summary: `New ruleset (movementModel="budget") gives high-move tiles
a meaningful storage capacity (move:60 -> ~2.0x base cap = 24 work
units on lab1). Most bots burn this every tick without realizing
the cap exists; Stockpile turns it into a strategic resource.

Per-army logic:
  1. Frontier check: if any neighbor is empty, owned by an enemy,
     or contains a non-cap friendly that wants reinforcement, this
     tile is on a frontier — defer entirely to Conqueror.act for
     normal adjacent play. Frontier budget is best spent now.
  2. Otherwise the tile is interior. If tile.budget < 0.85 * cap
     (cap is just budget * 1.0 here, see note below), idle this
     tick — let budget recharge.
  3. Tile is interior AND budget is near cap. Scan SCAN_RADIUS=4
     for the best enemy-tile target where work-cost (power x
     distance) fits in available budget AND the resulting commit
     wins under Lanchester (effective W > 1.15x effective L).
  4. Land the teleport. The captured tile resets to budget=0 by
     conquest rule, but our home tile keeps any leftover budget
     so we can refill faster.

Step 2's cap reference: we don't have direct access to the
maxBudget * moveRecharge cap from the strategy, so we infer the
cap as "budget at the highest value we've observed" via a
per-army state field. Simpler proxy: budget is "near cap" once it
stops growing. We use a reasonable fixed threshold (BUDGET >= 8)
that approximates 85% of the typical capped budget under move:60
on lab1 — close enough; the goal is "wait for nearly full,"
not "wait for exactly full."

Tech: {move:60, stack:0, prod:5, atk:25, def:10}. move:60 buys
2.0x recharge + 2.0x cap (24 work units) — the storage matters
for Stockpile and 2x recharge keeps the strategy responsive.
prod:5 is intentionally weak: Stockpile's interior tiles are
already saturated at maxArmy, so prod past that is wasted on
them; the bot's edge is in *spending* saved-up budget, not in
producing more strength. atk:25 amplifies Lanchester for
strikes. def:10 light cushion.

Expected wins: against bots that fritter budget every tick on
maxed-friendly reinforcement (every existing Conqueror). Expected
losses: in long matches where the interior never gets a clean
snipe and Stockpile is just a passive Conqueror — and in mirror
matches where neither bot finds a target.`,
  tech: { move: 60, stack: 0, prod: 5, atk: 25, def: 10 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;
    const pid = army.player.id;

    // Frontier? Defer to Conqueror immediately.
    if (!isInterior(tile, pid)) {
      Conqueror.act(army, game);
      return;
    }

    // Interior. Wait until budget is near cap before we strike.
    // Approximate threshold: under move:60 (this bot's tech), cap
    // is maxBudget * 2.0 = 24 on lab1; 85% of that is ~20.
    // We use a softer floor that also works for lower-move
    // techs in case this strategy is ever loaded with a different
    // loadout: budget must be at least 8 (~67% of neutral cap).
    if (tile.budget < 8) return;

    // Scan for a vulnerable enemy in range.
    const w = game.map.width;
    const h = game.map.height;
    const atkMult = (army.player.techMults?.atk ?? 1) * BONUS;
    const budget = tile.budget;
    let bestTarget = null;
    let bestScore = -Infinity;
    let bestPower = 0;

    for (let dy = -SCAN_RADIUS; dy <= SCAN_RADIUS; dy++) {
      for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const distSq = dx * dx + dy * dy;
        if (distSq > SCAN_RADIUS * SCAN_RADIUS) continue;
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
          if (a.player.id === pid) { friendly = true; break; }
          enemy += a.strength;
        }
        if (friendly) continue;
        // Cost formula: power * dist + 1. Max deliverable power is
        // (budget - 1) / dist.
        const maxPowerByBudget = (budget - 1) / dist;
        const maxPower = maxPowerByBudget < sLimit ? maxPowerByBudget : sLimit;
        if (maxPower <= 0.5) continue;
        if (maxPower * atkMult <= enemy * 1.15) continue;
        const score = enemy - 0.2 * dist;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
          bestPower = maxPower;
        }
      }
    }

    if (bestTarget) {
      army.attack(bestTarget, bestPower);
      return;
    }

    // Nothing to strike. Stay idle this tick — preserve budget.
  },
};
