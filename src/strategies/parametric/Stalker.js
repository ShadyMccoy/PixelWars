// Parametric Stalker. Stalker has Conqueror at the front line and a
// 5x5 stencil scan when stalled, picking the weakest beatable enemy
// and stepping toward it. Knobs expose:
//   - attackerBonus: the BONUS factor (1.4 default)
//   - killMargin:    the "+0.6" in `needed = enemy/BONUS + 0.6`
//   - growthBank:    the "+0.5" in distant-prey beatability gate
//   - stencilGate:   the minimum sLimit before doing the scan (0.5)
//   - targetMode:    0 = weakest-first (default), 1 = nearest-first
//   - reinforceGap:  the maxStrength-0.5 friendly-room threshold
// Output shape mirrors the original Stalker.

import { sumStrength } from "../../core/Army.js";
import Conqueror from "../Conqueror.js";

export const STALKER_DEFAULTS = Object.freeze({
  attackerBonus: 1.4,
  killMargin: 0.6,
  growthBank: 0.5,
  stencilGate: 0.5,
  targetMode: 0,         // 0=weakest, 1=nearest
  reinforceGap: 0.5,
});

export const STALKER_SCHEMA = Object.freeze({
  attackerBonus: { min: 1.0, max: 1.7, sigma: 0.04 },
  killMargin:    { min: 0.0, max: 1.5, sigma: 0.1 },
  growthBank:    { min: 0.0, max: 1.5, sigma: 0.1 },
  stencilGate:   { min: 0.0, max: 1.5, sigma: 0.1 },
  targetMode:    { min: 0, max: 1, sigma: 0.5, int: true },
  reinforceGap:  { min: 0.0, max: 2.0, sigma: 0.2 },
});

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

export function makeStalkerVariant(params = {}) {
  const p = { ...STALKER_DEFAULTS, ...params };
  const name = params.name ?? "ParamStalker";
  const BONUS = p.attackerBonus;
  const KILL_MARGIN = p.killMargin;
  const GROWTH_BANK = p.growthBank;
  const STENCIL_GATE = p.stencilGate;
  const NEAREST_FIRST = p.targetMode === 1;
  const REINFORCE_GAP = p.reinforceGap;

  return {
    name,
    author: "ga",
    version: 1,
    description: `Parametric Stalker (ab=${BONUS.toFixed(2)}, km=${KILL_MARGIN.toFixed(2)}, gb=${GROWTH_BANK.toFixed(2)}, sg=${STENCIL_GATE.toFixed(2)}, tm=${p.targetMode}, rg=${REINFORCE_GAP.toFixed(2)})`,
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const neighbors = tile.neighbors;
      const pid = army.player.id;
      const sLimit = army.attackPower;

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
          const needed = enemy / BONUS + KILL_MARGIN;
          if (needed <= sLimit) { hasAdjacentTarget = true; break; }
          continue;
        }
        if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - REINFORCE_GAP) {
          hasAdjacentTarget = true;
          break;
        }
      }
      if (hasAdjacentTarget) {
        Conqueror.act(army, game);
        return;
      }

      if (!tile.stencil5 || sLimit <= STENCIL_GATE) return;
      const stencil = tile.stencil5;
      const viewer = army.player;

      let bestDir = -1;
      let bestEnemy = NEAREST_FIRST ? 0 : Infinity;
      let bestDist = NEAREST_FIRST ? Infinity : 0;
      for (let i = 0; i < 25; i++) {
        const dir = DIR_HINT[i];
        if (dir < 0) continue;
        const t = stencil[i];
        if (!t) continue;
        const enemy = -sumStrength(t.armies, viewer);
        if (enemy <= 0) continue;
        if (enemy / BONUS > sLimit + GROWTH_BANK) continue;
        const dy = (i / 5) | 0;
        const dx = i - dy * 5;
        const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
        let better;
        if (NEAREST_FIRST) {
          better = dist < bestDist || (dist === bestDist && enemy < bestEnemy);
        } else {
          better = enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist);
        }
        if (better) {
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
        const needed = enemy / BONUS + KILL_MARGIN;
        if (needed > sLimit) return;
        army.attack(target, needed);
        return;
      }
      if (friendlyArmy) {
        if (friendlyArmy.strength >= friendlyArmy.maxStrength - REINFORCE_GAP) return;
        const room = friendlyArmy.maxStrength - friendlyArmy.strength;
        const power = Math.min(sLimit, room);
        if (power > 0.5) army.attack(target, power);
        return;
      }
      army.attack(target, sLimit);
    },
  };
}
