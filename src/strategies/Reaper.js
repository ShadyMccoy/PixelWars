import { sumStrength } from "../core/Army.js";

const DIR_HINT = (() => {
  const out = new Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dy = i - 2;
      const dx = j - 2;
      if (dx === 0 && dy === 0) { out[i * 5 + j] = -1; continue; }
      if (Math.abs(dx) >= Math.abs(dy)) out[i * 5 + j] = dx < 0 ? 0 : 1;
      else out[i * 5 + j] = dy < 0 ? 2 : 3;
    }
  }
  return out;
})();

export default {
  name: "Reaper",
  author: "claude",
  version: 1,
  description: "Pure killer. Only acts to kill enemy stacks; never grabs empty tiles or reinforces friendlies.",
  summary: `An assassin bot. Vampire kills weak adjacent enemies but also picks
up cheap empty tiles and tolerates idle ticks; Scout sprays empties; Settler
expands. Reaper does none of that — it refuses to spend strength on territory
or reinforcement, only on confirmed kills. The thesis: territory and stack
thickness will accrue passively as enemies die around us, while every tick
spent walking into an empty tile is a tick a productive home tile is not
growing. By refusing to soft-commit, we always strike at full attackPower
and always with margin.

Behavior priority each tick:
1. If an adjacent enemy stack is beatable, send minimum-overkill (enemy + 1).
   Among multiple kills, pick the *weakest* — same logic as Vampire,
   maximizes leftover home growth.
2. Otherwise, look at the 5x5 view for the weakest beatable enemy and step
   *one* tile toward them along the dominant axis (only into empties or
   own friendlies — we won't pick a fight on the way in unless we can win
   it cleanly at the destination).
3. Otherwise sit. Growth is the second job.

Weakness: in maps with no immediate enemies (royale early-game), Reaper
is a no-op and concedes territory to Scouts and Settlers. The bet is
that on contested maps the kill-density is high enough that step 1 fires
most ticks.`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.6) return;

    let bestTile = null;
    let bestEnemy = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (enemy + 1.1 > sLimit) continue;
      if (enemy < bestEnemy) {
        bestEnemy = enemy;
        bestTile = t;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestEnemy + 1);
      return;
    }

    // Reposition: step toward weakest distant prey, but only across safe
    // ground (empty or own friendly). No half-cooked engagements.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    let bestDir = -1;
    let bestRemoteEnemy = Infinity;
    let bestDist = 0;
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy + 1.1 > sLimit + 0.5) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (enemy < bestRemoteEnemy || (enemy === bestRemoteEnemy && dist < bestDist)) {
        bestRemoteEnemy = enemy;
        bestDist = dist;
        bestDir = dir;
      }
    }
    if (bestDir < 0) return;
    const step = neighbors[bestDir];
    if (!step) return;
    const stepArmies = step.armies;
    if (stepArmies.length === 0) {
      army.attack(step, sLimit);
      return;
    }
    let stepFriendly = null;
    let stepEnemy = 0;
    for (let k = 0; k < stepArmies.length; k++) {
      const a = stepArmies[k];
      if (a.player.id === pid) stepFriendly = a;
      else stepEnemy += a.strength;
    }
    if (stepEnemy > 0) return;
    if (stepFriendly && stepFriendly.strength < stepFriendly.maxStrength - 0.5) {
      const room = stepFriendly.maxStrength - stepFriendly.strength;
      const power = Math.min(sLimit, room);
      if (power > 0.5) army.attack(step, power);
    }
  },
};
