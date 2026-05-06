import { balanceAttack } from "./helpers.js";

const ROT = [0, 2, 1, 3];
const PHASE_TICKS = 2;

// Pinwheel g2: PHASE_TICKS = 2 (was 3 in g1, was 4 in original).
// Pushes the rotation cadence even faster. The g1 (PHASE_TICKS=3)
// outranked the parent and its sibling lineages, suggesting faster
// rotation helps the bot adapt to mid-match terrain. Halving again
// tests whether the trend continues or saturates - at PHASE_TICKS=2
// each direction holds only 2 ticks, which may be too short to make
// real progress in any one axis.
export default {
  name: "Pinwheel_g2_ae8180",
  author: "claude",
  version: 1,
  description: "Pinwheel g2 with PHASE_TICKS=2 (g1 had 3, original had 4).",
  summary: `Same Pinwheel logic. Only change: PHASE_TICKS is 2,
extending the trend g1 demonstrated (faster rotation = better
performance). Tests whether the optimum is even shorter than g1
or if 3 was the sweet spot.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const dir = ROT[Math.floor(game.tick / PHASE_TICKS) % 4];
    const target = tile.neighbors[dir];
    const pid = army.player.id;

    if (target) {
      const armies = target.armies;
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (friendlyArmy) {
        if (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          const room = friendlyArmy.maxStrength - friendlyArmy.strength;
          army.attack(target, Math.min(sLimit, room));
          return;
        }
      } else if (enemy <= 0) {
        army.attack(target, sLimit);
        return;
      } else if (enemy + 1 < army.strength) {
        army.attack(target, sLimit);
        return;
      }
    }

    const fallback = army.weakestAdjacent();
    if (fallback) balanceAttack(army, fallback);
  },
};
