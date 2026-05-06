import { balanceAttack } from "./helpers.js";

const ROT = [0, 2, 1, 3];
const PHASE_TICKS = 3;

// Pinwheel variant: PHASE_TICKS 4 -> 3. Faster rotation through the
// W -> N -> E -> S sweep. The synchrony thesis is unchanged - every
// army still points the same direction at the same tick - but each
// direction holds for only 3 ticks instead of 4. Should let the
// front line re-aim more responsively against bots like Trinity that
// re-aim continuously.
export default {
  name: "Pinwheel_g1_24119c",
  author: "claude",
  version: 1,
  description: "Pinwheel variant with PHASE_TICKS 3 (was 4) for faster rotation.",
  summary: `Same Pinwheel logic. Only change: PHASE_TICKS is 3 instead
of 4, so the directional sweep cycles 33% faster. The fall-through
to weakestAdjacent + balanceAttack is unchanged.`,
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
