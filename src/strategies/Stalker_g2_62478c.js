import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const GROWTH_BANK = 0.75;

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

// Stalker_g2: same kernel as parent, but move-heavy tech.
//
// Parent's losses include falling to Conqueror_g1_879a88 (move=90 tech)
// in seed=114, and a stall-out vs Citadel (Conqueror-derived) in seed=187.
// Both winners are Conqueror-shaped, and Conqueror_g1_879a88 was the
// biggest GA winner (+81 pp) precisely because it dropped its garrison
// floor. Parent ships neutral 20/20/20/20/20 (garrison=1.3, all 1.0x),
// which throttles every Conqueror.act minimum-overkill kill *and* every
// distant-prey commit through the stencil scan.
//
// We adopt a move-dominant loadout: move=70 -> garrison=0.8, ~63% larger
// attackPower than neutral on a 6-cap army. Keep small prod (the growth
// bank assumption in the stencil scan only pays off if we actually grow
// en route) and a sliver of atk/def (1.04x each at tech 6). No stack:
// Stalker doesn't want a fatter cap, it wants more force in motion.
//
// Logic is unchanged; the move buff also implicitly widens the
// beatability gate on distant prey since sLimit grows with attackPower.
export default {
  name: "Stalker_g2_62478c",
  author: "claude",
  version: 1,
  description: "Stalker with move-heavy tech (70/0/12/9/9) to fix attack-throughput stalls.",
  summary: `Same Stalker behavior as parent (Conqueror at the front,
weakest-prey 5x5 stencil scan when stalled, GROWTH_BANK=0.75). Only
change is tech: parent's neutral {20,20,20,20,20} was the throttle
seen in two of its three loss seeds — both winners (Citadel-style
Conqueror, and Conqueror_g1_879a88 explicitly with move=90) leverage
larger attackPower than parent's 1.3 garrison allows. Switch to
{move:70, stack:0, prod:12, atk:9, def:9}: garrison drops from 1.3 to
0.8, attackPower scales accordingly, and Stalker's distant-prey gate
(enemy/BONUS <= sLimit + 0.75) automatically engages farther targets
since sLimit is larger. Small prod keeps the growth-bank assumption
honest; no stack because Stalker is a kill-chain bot, not a hoarder.`,
  tech: { move: 70, stack: 0, prod: 12, atk: 9, def: 9 },
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
      if (enemy / BONUS > sLimit + GROWTH_BANK) continue;
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
