import { balanceAttack } from "./helpers.js";

// Cardinal-direction sequence: West, North, East, South. The bot rotates
// through these on a fixed cadence, so every army of this player is
// pointed the same way at the same time.
const ROT = [0, 2, 1, 3];
const PHASE_TICKS = 4;

export default {
  name: "Pinwheel",
  author: "shady",
  version: 1,
  description: "Synchronously sweeps attacks W → N → E → S, rotating direction every few ticks.",
  summary: `Every Pinwheel army of a player faces the same direction on the same
tick. The direction rotates every PHASE_TICKS ticks (W → N → E → S), so over
a full cycle the bot has pushed each cardinal in lockstep. The thesis is
mass-coordinated movement: when every front-line army shoves the same way
at once, the wave compounds — the tile we attacked last tick becomes
interior the next tick, and the friendly behind it ratchets forward
automatically. No painter, no centroid; the synchrony comes from
game.tick alone, which makes it deterministic and trivially cheap.

The fall-through matters: if the directed move is invalid (off-map,
maxed-out friendly, or a too-strong enemy) we play SlowAndSteady instead,
so a stalled army never sits idle waiting for the next phase. Expected to
tear through wide corridors and uncongested spawn boxes; expected to
struggle against Trinity-class flockers that re-aim continuously while
this bot is stuck on a phase.`,
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
        // Reinforce only if there's room; else fall through.
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
      // Directed move blocked — fall through to SlowAndSteady-ish backup.
    }

    const fallback = army.weakestAdjacent();
    if (fallback) balanceAttack(army, fallback);
  },
};
