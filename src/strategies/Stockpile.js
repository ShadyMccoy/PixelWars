import Parent from "./Conqueror_g13_b41df9.js";

const BONUS = 1.4;
// Search radius for opportunistic ranged strikes from interior
// tiles. Same constraint as Sniper — at distance > 3 the cost
// formula power*dist+1 plus a meaningful power requires more
// budget than even a fully-charged tile typically holds.
const SCAN_RADIUS = 3;
// Trigger interior strike when tile budget exceeds this fraction of
// the budget cap. 0.85 means we wait until the tile is nearly
// charged before firing.
const STRIKE_THRESHOLD = 0.85;
// Min target enemy strength worth a ranged strike — small enemies
// are best handled by adjacent kills (someone else's job).
const MIN_TARGET_STRENGTH = 2.5;

function isInterior(tile, pid) {
  const n = tile.neighbors;
  for (let i = 0; i < 4; i++) {
    const t = n[i];
    if (!t) continue;
    const armies = t.armies;
    if (armies.length === 0) return false;
    let foundFriendly = false;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) {
        foundFriendly = true;
        if (a.strength < a.maxStrength - 0.5) return false;
      }
    }
    if (!foundFriendly) return false;
  }
  return true;
}

export default {
  name: "Stockpile",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis on the frontier; interior tiles idle to let budget charge to cap, then teleport opportunistic alphas at vulnerable enemies in range. Strict upgrade over the chassis: idle saves the +1 move overhead, ranged strikes monetize otherwise-wasted budget.",
  summary: `An earlier Stockpile draft replaced the chassis tech with
high-move/low-prod to enable big alphas. The chassis fallback then
ran with starved tech and the bot underperformed on most ticks. v2
keeps g14_8d5369's validated chassis tech and adds two thin
behaviors that should each be a strict upgrade:

  1. Frontier (any non-friendly neighbor or non-cap friendly):
     defer to the chassis (Conqueror_g13_b41df9). The chassis is
     already validated against the lineage in this case.
  2. Interior (all neighbors are maxed friendlies): the chassis
     would Pass-3 stencil into a wasted reinforce or do nothing
     useful. Instead, gate on tile.budget >= 0.85 * cap. If the
     budget is near full, scan for a vulnerable enemy in range
     <=3 and fire a min-Lanchester teleport. Otherwise, idle.

Idle tiles avoid paying the +1 move-overhead. Range strikes only
fire when the chassis would have done a low-value action anyway,
so the bot is at minimum chassis-equivalent and sometimes better.

The cap-aware threshold is approximate: we don't have direct
access to the maxBudget * moveRecharge cap from the strategy.
Move:76 -> moveRecharge ~2.12 -> cap ~25.4. 0.85 * 25.4 = ~21.6;
we use a slightly softer floor of 16 budget to also work for
lower-move techs.

Tech mirrors the chassis champion {move:76, stack:0, prod:16,
atk:5, def:3} so the rule-aware additions are pure strict upgrade.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Parent.act(army, game);
      return;
    }
    const pid = army.player.id;

    // Frontier? Defer to chassis.
    if (!isInterior(tile, pid)) {
      Parent.act(army, game);
      return;
    }

    // Interior with low budget: idle (don't pay +1 overhead for
    // wasted reinforce moves).
    if (tile.budget < 16) return;

    // Budget is near cap. Scan for a ranged strike.
    const w = game.map.width;
    const h = game.map.height;
    const atkMult = (army.player.techMults?.atk ?? 1) * BONUS;
    const budget = tile.budget;
    const workCap = budget * 0.7;

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
        if (enemy < MIN_TARGET_STRENGTH) continue;

        const minPower = Math.sqrt(1.0 + (enemy / atkMult) ** 2) * 1.1;
        const maxPowerByBudget = (workCap - 1) / dist;
        const maxSelfCommit = sLimit * 0.5;
        const ceiling = Math.min(maxPowerByBudget, maxSelfCommit, sLimit);
        if (minPower > ceiling) continue;

        const score = enemy - 0.2 * dist;
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

    // No clean strike, full budget — let chassis fall through (it
    // may find a stencil move worth the overhead).
    Parent.act(army, game);
  },
};
