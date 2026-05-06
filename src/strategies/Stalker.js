import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> cardinal direction (W=0, E=1, N=2, S=3) of the dominant
// axis. Center cell has no direction.
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
  name: "Stalker",
  author: "claude",
  version: 1,
  description: "Conqueror that proactively pursues the weakest enemy in its 5x5 view.",
  summary: `Vampire only sees its four neighbors and waits for prey to wander
in. Hunter scans the 5x5 view but commits blindly toward the densest
enemy mass and dies to anything fatter than itself. Stalker splits the
two: prefer Conqueror behavior at the front (minimum-overkill kills,
empty grabs, friendly balance), but in the absence of an immediate
move, look at the 5x5 stencil for the *weakest* beatable enemy tile —
not the densest — and step toward it. Tracking weak prey is the right
heuristic: those are the tiles where a 1.4x-bonus kill turns into pure
profit, while dense enemy clusters are a problem we'd rather route
around. The stalker advances on the soft target, captures it, then
re-evaluates — a single bot effectively running its own kill chain.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    // If Conqueror has any viable adjacent move (free kill, empty, or
    // balanceable friendly), let it handle the tick. We only override
    // when *all* immediate options are blocked or pointless.
    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed <= sLimit) { hasAdjacentTarget = true; break; }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Interior or stalled — look 2 deep for the weakest beatable enemy and
    // pump strength toward them along its dominant axis.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestDir = -1;
    let bestEnemy = Infinity;
    let bestDist = 0;
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      // Beatable check — even from afar, our strength has to matter once we
      // arrive. Be a little more permissive than the adjacent gate to
      // account for growth on the way.
      if (enemy / BONUS > sLimit + 0.5) continue;
      // Prefer weakest, breaking ties by closest.
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
        bestDist = dist;
        bestDir = dir;
      }
    }
    if (bestDir < 0) return;
    const target = neighbors[bestDir];
    if (!target) return;
    const tArmies = target.armies;
    let friendlyArmy = null;
    let enemy = 0;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) friendlyArmy = a;
      else enemy += a.strength;
    }
    if (enemy > 0) {
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) return;
      army.attack(target, needed);
      return;
    }
    if (friendlyArmy) {
      if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) return;
      const room = friendlyArmy.maxStrength - friendlyArmy.strength;
      const power = Math.min(sLimit, room);
      if (power > 0.5) army.attack(target, power);
      return;
    }
    // Empty step toward distant prey.
    army.attack(target, sLimit);
  },
};
