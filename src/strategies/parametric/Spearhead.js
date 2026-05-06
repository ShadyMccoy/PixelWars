// Parametric Spearhead. The original Spearhead bakes in 7 magic
// constants (attacker bonus, four kernel weights collapsed to three
// distinct ones, empty-target bonus, friendly-target penalty, commit
// threshold). This template exposes them all as parameters so a
// search driver can sweep the space.
//
// makeSpearheadVariant({...params, name}) -> strategy object.
// Pass it to runMatch in a lineup like any other strategy.

import { sumStrength } from "../../core/Army.js";
import SlowAndSteady from "../SlowAndSteady.js";
import Trinity from "../Trinity.js";

export const SPEARHEAD_DEFAULTS = Object.freeze({
  attackerBonus: 1.4,
  bodyClose: 3,        // weight at [0, -1] (one cell behind on axis)
  bodyFar: 1,          // weight at [0, -2] (two cells behind on axis)
  flankClose: 1,       // weight at [-1, -1] and [1, -1] (rear flanks)
  emptyBonus: 20,      // added when target neighbor is empty
  friendlyPenalty: -10, // added when target neighbor has a friendly
  commitThreshold: 0.5, // minimum attackPower before committing a stencil push
});

// Schema (used by the GA): per-knob bounds + step size + integer flag.
export const SPEARHEAD_SCHEMA = Object.freeze({
  attackerBonus:    { min: 1.0,   max: 1.7,  sigma: 0.04 },
  bodyClose:        { min: 1,     max: 6,    sigma: 0.5,  int: true },
  bodyFar:          { min: 0,     max: 4,    sigma: 0.5,  int: true },
  flankClose:       { min: 0,     max: 4,    sigma: 0.5,  int: true },
  emptyBonus:       { min: 0,     max: 60,   sigma: 4 },
  friendlyPenalty:  { min: -40,   max: 0,    sigma: 4 },
  commitThreshold:  { min: 0.0,   max: 1.5,  sigma: 0.1 },
});

function buildKernels({ bodyClose, bodyFar, flankClose }) {
  // East-facing offsets: [dy, dx, weight]. Rotated to four cardinals.
  const east = [
    [0, -1, bodyClose],
    [0, -2, bodyFar],
    [-1, -1, flankClose],
    [1, -1, flankClose],
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
      // Skip zero-weight contributions for speed; they have no effect.
      if (w === 0) continue;
      out.push(idx, w);
    }
    return out;
  });
}

export function makeSpearheadVariant(params = {}) {
  const p = { ...SPEARHEAD_DEFAULTS, ...params };
  const name = params.name ?? "ParamSpearhead";
  const OFFSETS = buildKernels(p);
  const ATTACKER_BONUS = p.attackerBonus;
  const COMMIT = p.commitThreshold;
  const EMPTY = p.emptyBonus;
  const FRIENDLY = p.friendlyPenalty;

  return {
    name,
    author: "ga",
    version: 1,
    description: `Parametric Spearhead (ab=${ATTACKER_BONUS.toFixed(2)}, k=[${p.bodyClose},${p.bodyFar},${p.flankClose}], e=${EMPTY.toFixed(0)}, f=${FRIENDLY.toFixed(0)}, c=${COMMIT.toFixed(2)})`,
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const neighbors = tile.neighbors;
      const pid = army.player.id;
      const myEff = army.attackPower * ATTACKER_BONUS;

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

        const offs = OFFSETS[k];
        let score = 0;
        for (let n = 0; n < offs.length; n += 2) {
          const t = stencil[offs[n]];
          if (!t) continue;
          score += offs[n + 1] * sumStrength(t.armies, viewer);
        }
        if (info) {
          if (info.empty) score += EMPTY;
          else if (info.friendly) score += FRIENDLY;
        }
        if (score > bestScore) { bestScore = score; bestDir = k; }
      }
      if (bestDir < 0) {
        SlowAndSteady.act(army, game);
        return;
      }
      const power = army.attackPower;
      if (power > COMMIT) army.attack(neighbors[bestDir], power);
    },
  };
}
