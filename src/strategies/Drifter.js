import SlowAndSteady from "./SlowAndSteady.js";

const DIRS = [0, 1, 2, 3];

export default {
  name: "Drifter",
  author: "claude",
  version: 1,
  description: "Each army locks a single cardinal direction at first tick and pushes only that way for life.",
  summary: `One direction, one life. Most bots re-evaluate all four neighbors
every tick and oscillate between targets; Drifter commits each individual
army to a single cardinal direction at the moment it first acts, and
that army pushes only that way until it dies. The direction is chosen
deterministically via game.rng() so replays are reproducible.

Per-tick behavior, given the army's locked direction d:
1. If neighbors[d] is null (map edge with wrap off), die in place — no
   sideways diversion.
2. If neighbors[d] is empty, walk into it with attackPower.
3. If neighbors[d] has a friendly, reinforce it with up to 50% strength
   (pump-toward-the-front).
4. If neighbors[d] has a beatable enemy, send minimum-overkill.
5. If the enemy is too strong, sit and grow — but never sideways.

The thesis is that when a population of Drifters share a player, their
locked directions form a stochastic flow field across the map: half the
armies push east, a quarter north, etc. The result is a coordinated
front without any explicit communication — bots that face our advancing
direction get steamrolled, bots in our backfield direction never see us.

Compared to Berserker (random direction *each tick*), Drifter trades
chaos for momentum: a Berserker army wastes most of its strength
reversing and second-guessing, while a Drifter army covers ground.
Compared to a fixed-direction global bot, the per-army randomization
keeps the team from leaving the map entirely on one axis.

Weakness: an army locked into "south" with a fortress to its south
sits forever. We tolerate that — the rest of the team is making
progress on other axes.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    if (army.dir === undefined) {
      army.dir = DIRS[(game.rng() * 4) | 0];
    }
    const d = army.dir;
    const target = tile.neighbors[d];
    if (!target) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.6) return;

    const armies = target.armies;
    const pid = army.player.id;

    if (armies.length === 0) {
      army.attack(target, sLimit);
      return;
    }

    let friendlyArmy = null;
    let enemy = 0;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) friendlyArmy = a;
      else enemy += a.strength;
    }

    if (enemy > 0) {
      if (enemy + 1.1 > sLimit) {
        // Too strong to crack along our axis — sit and grow rather than
        // bail to a different direction. Fallback to SlowAndSteady would
        // betray the locked-axis thesis.
        return;
      }
      army.attack(target, enemy + 1);
      return;
    }

    if (friendlyArmy) {
      if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) return;
      const room = friendlyArmy.maxStrength - friendlyArmy.strength;
      const power = Math.min(army.strength * 0.5, room);
      if (power > 0.5) army.attack(target, power);
      return;
    }
    // Unreachable in current model, but defensive fallthrough.
    SlowAndSteady.act(army, game);
  },
};
