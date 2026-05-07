// Parameterized bot factories. Each call to makeBot / makeStencilBot returns
// a strategy object with the standard { name, act } shape. Designed so that
// many distinct, named bots can be expressed as plain config objects.
//
// makeBot models a "scan-the-four-neighbors-and-pick-one" loop. A bot is
// described by:
//
//   - activation gates (min strength absolute / fractional, tick gating)
//   - per-neighbor scoring weights (enemy strength, friendly count, gradient,
//     bonuses for empty/owned tiles)
//   - eligibility filters (must be winnable, must contain enemy, must be
//     empty, must not be friendly)
//   - selection mode ("min" picks lowest score, "max" picks highest)
//   - commitment mode ("frac" = forceFrac of (s-1), "all" = s-1,
//     "balance" = balanceAttack helper, "absolute" = forceAbsolute units)
//   - fallback when no neighbor passes filters ("slow", "balance",
//     "berserk", "wait")
//
// makeStencilBot picks one of four directions by convolving four 5x5 kernels
// against the tile's stencil, mirroring Trinity. The kernel index is also
// the chosen direction, so author kernels with that mapping in mind.

import { balanceAttack } from "./helpers.js";
import { sumStrength } from "../core/Army.js";

function applyFallback(name, army, game) {
  if (!name || name === "wait") return;
  if (name === "slow" || name === "balance") {
    const t = army.weakestAdjacent();
    if (t) balanceAttack(army, t);
    return;
  }
  if (name === "berserk") {
    if (army.strength < 2) return;
    const dir = (game.rng() * 4) | 0;
    const tile = army.tile ? army.tile.neighbors[dir] : null;
    if (tile) army.attack(tile, army.attackPower);
  }
}

export function makeBot(cfg) {
  const {
    name,
    description = "",
    author = "factory",
    minStrengthAbs = 1.5,
    minStrengthFrac = 0,
    tickPeriod = 1,
    tickPhase = 0,
    weightEnemy = 1,
    weightFriendly = 0,
    weightEmptyBonus = 0,
    weightOwnedBonus = 0,
    gradient = null,
    requireWinnable = false,
    requireEnemy = false,
    requireEmpty = false,
    avoidFriendly = false,
    forceFrac = 1.0,
    forceMinPower = 1.5,
    forceMode = "frac",
    forceAbsolute = null,
    pickMode = "min",
    fallbackName = null,
    summary = "",
  } = cfg;

  return {
    name,
    description,
    author,
    version: 1,
    summary,
    // Stamped so the spawn pipeline can synthesize a standalone .js file
    // for this bot on demand (see tournament/spawn.js). Factory bots don't
    // have dedicated source files, so without this stamp they'd be unable
    // to be parents in the genetic-spawn lineage.
    _factoryKind: "makeBot",
    _factoryConfig: { ...cfg },
    act(army, game) {
      if (army.strength < minStrengthAbs) return;
      if (minStrengthFrac > 0 && army.strength < army.maxStrength * minStrengthFrac) return;
      if (tickPeriod > 1 && (game.tick % tickPeriod) !== tickPhase) return;

      const tile = army.tile;
      if (!tile) return;
      const neighbors = tile.neighbors;
      const pid = army.player.id;

      let best = null;
      let bestScore = pickMode === "max" ? -Infinity : Infinity;

      for (let i = 0; i < 4; i++) {
        const t = neighbors[i];
        if (!t) continue;
        const armies = t.armies;
        let enemyS = 0;
        let friendly = 0;
        for (let k = 0; k < armies.length; k++) {
          const a = armies[k];
          if (a.player.id === pid) friendly++;
          else enemyS += a.strength;
        }
        const owned = friendly > 0;
        const isEmpty = armies.length === 0;

        if (requireEnemy && enemyS === 0) continue;
        if (requireEmpty && !isEmpty) continue;
        if (requireWinnable && enemyS + 1 >= army.strength) continue;
        if (avoidFriendly && owned) continue;

        let score = weightEnemy * enemyS - weightFriendly * friendly;
        if (isEmpty) score -= weightEmptyBonus;
        if (owned) score -= weightOwnedBonus;
        if (gradient) score -= gradient[i];

        if (pickMode === "max") {
          if (score > bestScore) { bestScore = score; best = t; }
        } else {
          if (score < bestScore) { bestScore = score; best = t; }
        }
      }

      if (!best) {
        applyFallback(fallbackName, army, game);
        return;
      }

      if (forceMode === "balance") {
        balanceAttack(army, best);
        return;
      }

      let power;
      if (forceMode === "all") {
        power = army.attackPower;
      } else if (forceMode === "absolute" && forceAbsolute != null) {
        power = forceAbsolute;
      } else {
        power = (army.attackPower) * forceFrac;
      }
      if (power < forceMinPower) power = forceMinPower;
      const cap = army.attackPower;
      if (power > cap) power = cap;
      if (power <= 0.6) return;
      army.attack(best, power);
    },
  };
}

// Stencil bot: four 5x5 kernels, kernel index k <=> direction k (W,E,N,S).
export function makeStencilBot(cfg) {
  const {
    name,
    description = "",
    author = "factory",
    kernels,
    forceFrac = 1.0,
    forceMode = "frac",
    fallbackName = null,
    summary = "",
  } = cfg;

  const OFFSETS = kernels.map((k) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const w = k[i][j];
        if (w !== 0) out.push(i * 5 + j, w);
      }
    }
    return out;
  });

  return {
    name,
    description,
    author,
    version: 1,
    summary,
    _factoryKind: "makeStencilBot",
    _factoryConfig: { ...cfg },
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const stencil = tile.stencil5;
      const viewer = army.player;

      let bestDir = -1;
      let bestScore = -Infinity;
      for (let k = 0; k < OFFSETS.length; k++) {
        const offs = OFFSETS[k];
        let score = 0;
        for (let n = 0; n < offs.length; n += 2) {
          const t = stencil[offs[n]];
          if (!t) continue;
          score += offs[n + 1] * sumStrength(t.armies, viewer);
        }
        if (score > bestScore) { bestScore = score; bestDir = k; }
      }

      const target = bestDir >= 0 ? tile.neighbors[bestDir] : null;
      if (!target) {
        applyFallback(fallbackName, army, game);
        return;
      }

      let power;
      if (forceMode === "all") power = army.attackPower;
      else power = (army.attackPower) * forceFrac;
      if (power < 1.5) {
        applyFallback(fallbackName, army, game);
        return;
      }
      army.attack(target, power);
    },
  };
}
