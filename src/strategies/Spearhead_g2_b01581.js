import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const FRIENDLY_TARGET_PENALTY = -20;
const EMPTY_TARGET_BONUS = 20;

// Spearhead_g1_dc0148 finished #2 of 6 in season #20, beaten by
// Conqueror_g3_51d626. The parent ran neutral {20,20,20,20,20} tech,
// so its garrison floor is 1.3 strength per attack while the winning
// Conqueror's move=90 loadout leaves only 0.6 behind. With maxArmy=6
// and growth=1.8 on a 24x18 wrap, that's the difference between
// shoving ~3.7 strength forward versus ~5.4 - the move-heavy bot
// out-pressured Spearhead before the kernel-direction advantage
// could compound.
//
// The kill-priority + 5x5 kernel-scoring strategy is sound; what's
// missing is throughput. This descendant keeps the parent's act()
// byte-for-byte (same kernel, same -20/+20 target weights, same
// fallback chain) and only retunes tech. The thesis: Spearhead's
// kernel picks good directions, but it needs the mobility budget
// of a Blitz bot to make those directions matter.
//
//   move: 60 -> garrison floor 0.9, ~50% more push per attack vs
//               parent; not as extreme as Conqueror_g3's 90 because
//               Spearhead's kernel benefits from rear support tiles
//               not being totally stripped.
//   atk:  25 -> small bump above neutral leans into Spearhead's
//               attacker identity; ATTACKER_BONUS heuristic stays
//               at 1.4 (conservative) so we don't start picking
//               fights the engine can't actually win.
//   prod: 10 -> mild regen penalty; Spearhead is push-not-stall so
//               regen matters less than throughput.
//   def:   5 -> minimal; we're committing to offense.
//   stack: 0 -> we don't hoard, so the maxStrength multiplier is
//               the cheapest place to take the cut.
function buildKernels() {
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

const OFFSETS = buildKernels();

export default {
  name: "Spearhead_g2_b01581",
  author: "claude",
  version: 1,
  description: "Spearhead_g1 with move/atk-skewed Blitz tech to match the throughput of move-heavy Conqueror opponents.",
  summary: `Parent's act() is unchanged - same combat path, same -20
friendly-target penalty, same +20 empty-target bonus, same kernel.
Only the tech loadout changes: move 20->60, atk 20->25, def 20->5,
prod 20->10, stack 20->0. Rationale in the file header comment;
short version: Spearhead's kernel chooses good directions, but
neutral tech leaves it pushing 1.3 strength less per attack than
the move=90 Conqueror_g3_51d626 that beat it. Closing the
throughput gap is expected to be a higher-leverage change than
any further kernel tweak.`,
  tech: { move: 60, stack: 0, prod: 10, atk: 25, def: 5 },
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

      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      if (info) {
        if (info.empty) score += EMPTY_TARGET_BONUS;
        else if (info.friendly) score += FRIENDLY_TARGET_PENALTY;
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
