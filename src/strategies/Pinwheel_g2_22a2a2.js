import { balanceAttack } from "./helpers.js";

// Pinwheel g2: asymmetric phases. The original Pinwheel holds each
// direction for the same number of ticks. This variant holds W and
// E (horizontal) for 2 ticks, N and S (vertical) for 4 ticks. On
// the wrapping lab1 map W and E reach far horizons quickly because
// the map wraps on width 24 - holding briefly is enough; N and S
// span the full 18-row height that doesn't wrap as productively, so
// holding longer lets the bot make real progress. Test of whether
// axis-aware phase tuning beats uniform rotation.
const ROT = [0, 2, 1, 3];           // W, N, E, S
const PHASE_PER_DIR = [2, 4, 2, 4]; // shorter on horizontal, longer on vertical

// Cumulative end-tick of each phase within one full cycle.
const CYCLE_LEN = PHASE_PER_DIR.reduce((a, b) => a + b, 0);
const CUM_ENDS = (() => {
  const out = [];
  let s = 0;
  for (const t of PHASE_PER_DIR) { s += t; out.push(s); }
  return out;
})();

function phaseFor(tick) {
  const t = ((tick % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
  for (let i = 0; i < CUM_ENDS.length; i++) {
    if (t < CUM_ENDS[i]) return i;
  }
  return CUM_ENDS.length - 1;
}

export default {
  name: "Pinwheel_g2_22a2a2",
  author: "claude",
  version: 1,
  description: "Pinwheel with asymmetric phases: 2 ticks horizontal, 4 ticks vertical.",
  summary: `Same Pinwheel sweep, but the phase duration depends on
direction. Lab1 wraps horizontally (24 wide) and not vertically
(18 tall), so horizontal pushes pay off quickly while vertical
pushes need more ticks to span the map. PHASE_PER_DIR [W=2, N=4,
E=2, S=4] aligns the time budget with the geometry. Same fall-
through behavior on blocked moves.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const phase = phaseFor(game.tick);
    const dir = ROT[phase];
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
