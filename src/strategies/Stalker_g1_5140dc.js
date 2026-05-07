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
  name: "Stalker_g1_5140dc",
  author: "claude",
  version: 1,
  description: "Stalker that aggregates beatable prey by direction instead of homing on one weakest tile.",
  summary: `Parent Stalker picks THE single weakest beatable enemy in the 5x5
view and steps along its dominant axis. That is fine when one juicy
target dominates the stencil, but it throws away cluster information:
if one hemisphere contains three soft kills and the other has one
slightly softer kill, the parent still walks alone toward the one.

This descendant aggregates beatable softness per cardinal direction
instead. For every stencil tile that holds enemies we *could* take
(needed <= sLimit + 0.5, same gate as parent), we add the per-tile
profit margin (sLimit - needed, floored at 0) plus a small flat
density bonus to that direction's score. We then move toward the
hemisphere with the highest aggregated opportunity, breaking ties by
closest beatable target.

The change should help on lab1's 24x18 wrap map when the bot is in
the interior surrounded by mixed enemies — instead of fixating on a
specific tile (which the engine may have grown out of reach by the
time we arrive), we walk toward the side of the field that is most
exploitable. It also degrades gracefully back to parent behavior in
the common case where there is only one beatable tile in view.

Tech: inherited from parent (move 50 / atk 50 blitz-berserker), since
the parent dominated season #21 with no recorded losses — the issue
to attack is target selection, not the loadout.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    // Defer to Conqueror whenever an immediate adjacent move is
    // profitable (free kill, empty grab, balanceable friendly).
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

    // Interior or stalled — aggregate beatable softness per direction
    // over the 5x5 stencil and march toward the most exploitable side.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    const score = [0, 0, 0, 0];
    const closest = [99, 99, 99, 99];
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      const needed = enemy / BONUS;
      if (needed > sLimit + 0.5) continue;
      const profit = sLimit - needed;
      // Flat 0.1 density bonus per beatable tile + clamped profit margin.
      score[dir] += (profit > 0 ? profit : 0) + 0.1;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (dist < closest[dir]) closest[dir] = dist;
    }

    let bestDir = -1;
    let bestScore = 0;
    let bestClose = Infinity;
    for (let d = 0; d < 4; d++) {
      if (score[d] <= 0) continue;
      if (score[d] > bestScore || (score[d] === bestScore && closest[d] < bestClose)) {
        bestScore = score[d];
        bestClose = closest[d];
        bestDir = d;
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
