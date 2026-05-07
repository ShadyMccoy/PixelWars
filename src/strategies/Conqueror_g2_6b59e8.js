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

// Parent Conqueror_g1_879a88 = Conqueror behavior + move-heavy tech
// (90/0/2/4/4). It loses primarily to two failure modes visible in
// season #4:
//   (a) Max-tick stalls vs Membrane variants (3 of 5 losses ended at
//       4000 ticks) - Conqueror only looks at adjacent tiles, so once
//       the front stabilizes it idles instead of pushing.
//   (b) Direct losses to Stalker / Stalker_g1_* (3 of 5 losses, and
//       both 4000-tick survivor wins) - Stalker's edge is exactly the
//       fallback this bot is missing.
//
// Stalker beat the parent by reusing Conqueror at the front and
// extending the search to a 5x5 stencil for the weakest beatable enemy
// when no adjacent move is profitable. Wrapping that same fallback
// around the parent's move-heavy tech compounds the two ideas: high
// move tech (0.6 garrison floor) means the bot can throw nearly its
// whole stack into a stalker-style step toward distant prey, turning
// idle interior ticks into territory pressure.
export default {
  name: "Conqueror_g2_6b59e8",
  author: "claude",
  version: 1,
  description: "Conqueror_g1_879a88 + Stalker's 5x5 weakest-prey fallback.",
  summary: `Parent (Conqueror + move-heavy tech 90/0/2/4/4) was the
biggest gainer in the cross-strategy sweep but stalled at max-ticks
in 3 of its 5 season-4 losses and lost head-to-head to Stalker
variants in the other 2. Stalker's documented edge is exactly the
fallback the parent lacks: when no adjacent move is profitable,
scan the 5x5 stencil for the weakest beatable enemy and step toward
it along the dominant axis. Inheriting the parent's tech keeps the
0.6 garrison floor that made it strong; adding Stalker's fallback
removes the interior-stall failure mode. Hard rules unchanged: the
front-line behavior is still Conqueror.act, and we only override
when every adjacent option is blocked or pointless.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    // Defer to Conqueror whenever any adjacent move is viable: free kill,
    // empty grab, or a friendly that has room to be balanced toward.
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

    // Stalled — look 2 deep for the weakest beatable enemy and step
    // toward it along its dominant axis.
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
      if (enemy / BONUS > sLimit + 0.5) continue;
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
    army.attack(target, sLimit);
  },
};
