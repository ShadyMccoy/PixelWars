import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const FORWARD_ENEMY_PENALTY = 6;

// Forward-aware Spearhead. Standard Spearhead picks a direction by
// rear support and target preference, never looking at what's in
// the path ahead. That works when the bot is the spearhead tip and
// there's a clear corridor forward, but loses when the path is
// walled by enemy mass that's too strong to kill at the wall - the
// bot commits force into a dead-end.
//
// This variant adds a forward-enemy penalty: for each candidate
// direction we tally enemy strength in the cells 1-2 steps ahead
// (axis + ahead-flanks) and subtract that from the rear-support
// score. Rear support still drives selection; the penalty just
// rules out directions where the corridor is blocked.
function buildRearKernels() {
  const east = [
    [0, -1, 3], [0, -2, 1],
    [-1, -1, 1], [1, -1, 1],
  ];
  function rotate([dy, dx, w], dir) {
    switch (dir) {
      case 0: return [dy, -dx, w];
      case 1: return [dy, dx, w];
      case 2: return [-dx, dy, w];
      case 3: return [dx, -dy, w];
    }
    return [dy, dx, w];
  }
  return [0, 1, 2, 3].map((dir) => {
    const out = [];
    for (const t of east) {
      const [dy, dx, w] = rotate(t, dir);
      const idx = (dy + 2) * 5 + (dx + 2);
      if (idx < 0 || idx >= 25) continue;
      out.push(idx, w);
    }
    return out;
  });
}

function buildForwardKernels() {
  const eastForward = [
    [0, 1, 3], [0, 2, 1],
    [-1, 1, 1], [1, 1, 1],
  ];
  function rotate([dy, dx, w], dir) {
    switch (dir) {
      case 0: return [dy, -dx, w];
      case 1: return [dy, dx, w];
      case 2: return [-dx, dy, w];
      case 3: return [dx, -dy, w];
    }
    return [dy, dx, w];
  }
  return [0, 1, 2, 3].map((dir) => {
    const out = [];
    for (const t of eastForward) {
      const [dy, dx, w] = rotate(t, dir);
      const idx = (dy + 2) * 5 + (dx + 2);
      if (idx < 0 || idx >= 25) continue;
      out.push(idx, w);
    }
    return out;
  });
}

const REAR = buildRearKernels();
const FORWARD = buildForwardKernels();

export default {
  name: "Spearhead_g1_e91678",
  author: "claude",
  version: 1,
  description: "Spearhead variant that also penalizes enemy mass in the forward corridor.",
  summary: `Standard Spearhead picks a direction by rear support
alone. This variant additionally penalizes directions where the
corridor ahead is dense with enemies the bot can't kill adjacent.
Rear support still drives selection; the forward penalty just
rules out blocked directions.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;

    let bestKill = null;
    let bestKillStr = -1;
    const neighborInfo = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      neighborInfo[i] = { friendly, enemy, empty: armies.length === 0 };
      if (friendly || enemy <= 0) continue;
      if (myEff <= enemy) continue;
      if (enemy > bestKillStr) { bestKillStr = enemy; bestKill = t; }
    }
    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }

    if (!tile.stencil5) {
      Trinity.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;
    let bestDir = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < 4; k++) {
      const target = neighbors[k];
      if (!target) continue;
      const info = neighborInfo[k];
      if (info && !info.friendly && info.enemy > 0 && myEff <= info.enemy) continue;

      const rearOffs = REAR[k];
      let score = 0;
      for (let n = 0; n < rearOffs.length; n += 2) {
        const t = stencil[rearOffs[n]];
        if (!t) continue;
        score += rearOffs[n + 1] * sumStrength(t.armies, viewer);
      }

      const fwdOffs = FORWARD[k];
      let forwardEnemyMass = 0;
      for (let n = 0; n < fwdOffs.length; n += 2) {
        const t = stencil[fwdOffs[n]];
        if (!t) continue;
        const armies = t.armies;
        for (let m = 0; m < armies.length; m++) {
          const a = armies[m];
          if (!a.player.equals(viewer)) {
            forwardEnemyMass += fwdOffs[n + 1] * a.strength;
          }
        }
      }
      score -= FORWARD_ENEMY_PENALTY * forwardEnemyMass;

      if (info) {
        if (info.empty) score += 20;
        else if (info.friendly) score -= 10;
      }
      if (score > bestScore) { bestScore = score; bestDir = k; }
    }
    if (bestDir < 0) {
      SlowAndSteady.act(army, game);
      return;
    }
    const power = army.attackPower;
    if (power > 0.5) army.attack(neighbors[bestDir], power);
  },
};
