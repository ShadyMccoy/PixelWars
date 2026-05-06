import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintCitadelSortie,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_SORTIE,
  ROLE_CORE,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

const ATTACKER_BONUS = 1.4;
const SORTIE_WIDTH = 2;
const CORE_RADIUS = 2;
const STOCKPILE_RELEASE_FRAC = 0.5;

export default {
  name: "CitadelSortie",
  author: "shady",
  version: 1,
  description: "Painter-based: stockpile a fortified core, funnel strength into a single sortie front against the weakest rival.",
  summary: `A patience-and-concentration bot. The painter picks the
single weakest neighboring rival every tick and labels:

  - SORTIE: 1–2 friendly border tiles closest to that rival's
    centroid. This is the only tile we actively attack from.
  - CORE: friendly tiles within Manhattan radius 2 of our centroid —
    a fortified stockpile.
  - FRONT: any other border tile (defends but doesn't push).
  - INTERIOR: enclosed friendly tile, gradient depth from sortie.

Per-army act():
  - Kill-or-stay first (always).
  - SORTIE → Spearhead push outward.
  - CORE → stockpile. Sit until strength >= 85% of max, then release
    toward the lowest-depth friendly neighbor (i.e. start the wave
    that ends at the sortie tile).
  - FRONT → balanceAttack on the weakest neighbor only. Defends and
    nibbles, but never feeds the wrong front.
  - INTERIOR → pump to the lowest-depth friendly neighbor (toward
    sortie, not the nearest border).

Compared to Frontier and PressureSink: those treat the border
uniformly. CitadelSortie biases its interior supply chain toward a
single rival, so even on a wide territory the wave aims at one place.
On 500-match arena tests this came in 10th of 12 — the
"concentrate on one rival" idea just doesn't fit a 6-way FFA where
ceding any direction means a different neighbor is overrunning you.
Kept around as the qualitatively-different painter demo: shows that
painter *quality* drives behavior, and that not every globally-sane
plan is locally affordable.`,
  act(army, game) {
    if (tryKillAdjacent(army, ATTACKER_BONUS)) return;

    const tile = army.tile;
    if (!tile) return;
    const map = game.map;
    const idx = tile.pos.y * map.width + tile.pos.x;
    const plan = paintCitadelSortie(game, army.player, {
      sortieWidth: SORTIE_WIDTH,
      coreRadius: CORE_RADIUS,
    });
    const role = plan.roles[idx];

    if (role === ROLE_SORTIE) {
      Spearhead.act(army, game);
      return;
    }
    if (role === ROLE_CORE) {
      // Half-stockpile: release once we hit a soft threshold. Full
      // stockpile (waiting for >85%) starves the supply chain — by
      // the time the wave releases, everyone downstream has already
      // refilled. Lower threshold keeps strength flowing.
      if (army.strength < army.maxStrength * STOCKPILE_RELEASE_FRAC) return;
      const next = lowestDepthFriendlyNeighbor(army, plan);
      if (next) {
        const power = army.attackPower;
        if (power > 0.5) army.attack(next, power);
      }
      return;
    }
    if (role === ROLE_FRONT) {
      // Non-sortie border still pushes — the "concentration" is in the
      // gradient direction (interior flows to sortie, not here), not in
      // ceding territory along the rest of the perimeter.
      Spearhead.act(army, game);
      return;
    }
    if (role === ROLE_INTERIOR) {
      const next = lowestDepthFriendlyNeighbor(army, plan);
      if (next) {
        const power = army.attackPower;
        if (power > 0.5) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
