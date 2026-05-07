import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const KILL_MARGIN = 0.6;
const COMMIT_THRESHOLD = 1.0;
const MIN_REAR_SUPPORT = 1.0;

// Spearhead g3 (parent: Spearhead_g2_1b3e2d). Two changes vs parent.
//
// 1) Tech: 40/20/20/10/10 instead of neutral 20/20/20/20/20. Parent
//    ran neutral tech, but the spearhead thesis ("build up, then
//    punch") gets the most value out of move - lower garrison floor
//    means a harder commit. All three of g2's recent losses were to
//    move-heavy Conquerors (move 80-90, garrison 0.6-0.7) that
//    simply punch more strength forward per tick. Bumping move 20
//    -> 40 drops the garrison floor 1.3 -> 1.1, lifting peak
//    attackPower from ~4.7 to ~4.9. Cost is paid by atk and def at
//    10 each (~0.92x); stack and prod stay at neutral 20 so we
//    don't compromise the build-up phase that this strategy depends
//    on.
//
// 2) Adjacent kills use minimum-overkill sizing instead of full
//    attackPower. Parent's pre-scan kill threw FULL attackPower at
//    any killable adjacent enemy, which is wasteful: a 0.5-strength
//    flank enemy only needs ~0.96 to kill (enemy / 1.4 + 0.6
//    margin), and the surplus would be much better preserved on the
//    source tile to feed the next tick's spearhead push. Mirrors
//    Conqueror's sizing math, applied here to Spearhead's pre-scan.
//    Note: the engine resolves an army's attack against a single
//    target; the surplus stays on the source tile and is available
//    next tick at full power.
//
// Everything else (kernel scoring, MIN_REAR_SUPPORT discipline,
// COMMIT_THRESHOLD, fallback to SlowAndSteady, fallback to Trinity
// when stencil5 absent) is byte-identical to the parent.
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
  name: "Spearhead_g3_13d311",
  author: "claude",
  version: 1,
  description: "Spearhead g3: move-biased tech (40/20/20/10/10) + minimum-overkill on adjacent kills.",
  summary: `Parent Spearhead_g2_1b3e2d ran neutral tech (20/20/20/20/20)
and threw full attackPower at every killable adjacent enemy. Both
choices leak punch-power that the spearhead commit could otherwise
use, and all three of g2's recent losses were to move-heavy
Conquerors that simply outpunched it tick-for-tick.

Tech change: 40/20/20/10/10. Move bumps from 20 to 40, dropping the
garrison floor 1.3 -> 1.1 - peak attackPower lifts from ~4.7 to
~4.9. atk and def trim to 10 each (~0.92x, ~8% penalty); stack and
prod stay at neutral 20 so the build-up phase isn't compromised.
Won't match a 90-move Conqueror's punch, but closes a meaningful
fraction of the gap without the defensive fragility a more extreme
move loadout would bring.

Strategy tweak: adjacent kills use minimum-overkill sizing
(enemy / ATTACKER_BONUS + 0.6) instead of full attackPower. A small
flank enemy at 0.5 strength needs only ~0.96 to kill; throwing the
whole ~4 attackPower drains the source tile and skips the next
tick's stencil-aligned commit for nothing. With min-overkill the
kill still happens, the surplus stays home, and the next tick's
push lands at near-full power. Mirrors the same insight Conqueror
exploits in its kill-sizing.

Everything else - kernel weighting, MIN_REAR_SUPPORT discipline,
COMMIT_THRESHOLD, SlowAndSteady fallback, Trinity fallback - is
byte-identical to the parent.`,
  tech: { move: 40, stack: 20, prod: 20, atk: 10, def: 10 },
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
      const needed = bestKillStr / ATTACKER_BONUS + KILL_MARGIN;
      const power = Math.min(army.attackPower, needed);
      army.attack(bestKill, power);
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
    let bestRearSupport = 0;
    for (let k = 0; k < 4; k++) {
      const target = neighbors[k];
      if (!target) continue;
      const info = neighborInfo[k];
      if (info && !info.friendly && info.enemy > 0 && myEff <= info.enemy) continue;

      const offs = OFFSETS[k];
      let kernelScore = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        kernelScore += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      let score = kernelScore;
      if (info) {
        if (info.empty) score += 20;
        else if (info.friendly) score -= 10;
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = k;
        bestRearSupport = kernelScore;
      }
    }
    if (bestDir < 0 || bestRearSupport < MIN_REAR_SUPPORT) {
      SlowAndSteady.act(army, game);
      return;
    }
    const power = army.attackPower;
    if (power > COMMIT_THRESHOLD) army.attack(neighbors[bestDir], power);
  },
};
