import { sumStrength } from "../core/Army.js";
import Parent from "./Conqueror_g13_b41df9.js";

const BONUS = 1.4;
const MARGIN = 0.45;
// Friendly's pressure must exceed ours by at least this much (5x5
// summed enemy strength) to justify paying the +1 move overhead to
// relay. Calibrated low because the move cost is constant per tick
// and the strength delivered is what compounds at the front.
const PRESSURE_GRADIENT = 0.5;

function scanPressure(stencil, viewer) {
  if (!stencil) return 0;
  let p = 0;
  for (let i = 0; i < 25; i++) {
    const c = stencil[i];
    if (!c) continue;
    const e = -sumStrength(c.armies, viewer);
    if (e > 0) p += e;
  }
  return p;
}

export default {
  name: "Conduit",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis with a Lanchester relay: when no adjacent enemy or empty exists, push strength to the adjacent friendly whose own 5x5 pressure exceeds ours, instead of letting the chassis balance toward parity. Interior armies feed the front instead of pooling.",
  summary: `Lanchester's law says combat losses scale quadratically with
numerical advantage, so any unit not in contact with the enemy is
worth more if it is moved toward contact than if it is held in
reserve. The chassis already does this when an enemy is in our
own 5x5 stencil (Pass 3 walks toward it via primary/secondary
direction). The blind spot is the deep interior: an army with no
enemy in its own 5x5 but adjacent to a friendly that is closer
to the front. Conqueror's fallback (Pass 2 / Conqueror.act) picks
a balance target via Trinity-kernel alignment, which has no
notion of where the front actually is — strength can pool into
whichever friendly happens to align, not the one bleeding under
pressure.

Reservoir identified the same gap and chose to *idle* the
interior tick to save the +1 move overhead. Conduit makes the
opposite choice: pay the overhead but route the relay
pressure-first. Concretely:

  1. If any adjacent tile holds an enemy or is empty, defer
     entirely to the parent chassis. Pass 1 (kill scoring,
     hemisphere/retake-aware) and Pass 2 (Conqueror.act
     expansion) handle these cases well; we don't second-guess.
  2. If we have no adjacent action target, scan our 4 adjacent
     understrength friendlies. For each, sum the enemy strength
     in *its* 5x5 stencil. The friendly with the highest
     pressure is closer to the front by definition (it sees more
     enemies than its neighbors do).
  3. If that friendly's pressure exceeds ours by at least
     PRESSURE_GRADIENT (a small absolute threshold to avoid
     relaying on noise), push as much strength as we can into
     it, capped by the friendly's remaining room (so we never
     waste delivery on a near-maxed tile, the bug Reservoir
     was avoiding).
  4. Otherwise defer to the parent's Pass 3 stencil walk and
     final Conqueror.act fallback.

This is strictly additive: in every case where a kill, expansion,
or 5x5-visible enemy exists, behavior is byte-identical to the
parent. The only divergence is in the pure-interior case the
parent handles via alignment kernels and Conduit handles via a
pressure gradient.

Tradeoffs:
  - Move cost: each relay pays power*1 + 1. We only fire when
    the friendly is understrength and has more pressure than
    us, so the strength delivered is non-zero and the
    direction is correct. The 0.5 gradient threshold prevents
    fire on noise; tune up if the bot relays too eagerly.
  - Stencil access on neighbor tiles: relies on tile.stencil5
    being populated for adjacent friendlies, which is true in
    the engine (every tile has its own stencil5).
  - No multi-hop coordination: this is a single-hop relay. A
    friendly two tiles deep doesn't see further than a friendly
    one tile deep, so chains form by repetition over ticks
    rather than planned routes. That's fine for a Lanchester
    pump — strength conveys outward as fast as it's produced.

Ablation (tournament/exp-conduit-tuning.js):
  - 1v1 vs parent: every gradient in {0, 0.25, 0.5, 0.75, 1, 1.5,
    2, 3, 5, 10} wins 100/100. The relay mechanism itself is the
    win; threshold is largely insensitive at absolute scale.
    Territory delta narrowly favors g=0.5 (349.4) over the others
    (344-349), so we keep it.
  - 2-hop horizon (sum half-weighted pressure from
    neighbors-of-neighbors): clear regression, ~1.5 places worse
    than 1-hop in an 8-way ablation. Propagation across friendlies
    adds noise that the chassis Pass 3 handles better directly.
    Don't extend the scan depth.

Tech mirrors the parent's {move:80, stack:0, prod:12, atk:4,
def:4}. The relay is a strategy-only delta so the comparison
isolates the Lanchester pump from tech tuning.`,
  tech: { move: 80, stack: 0, prod: 12, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Parent.act(army, game);
      return;
    }

    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const viewer = army.player;

    // One pass over neighbors: classify each direction and collect
    // understrength friendlies for the relay scan.
    let hasAdjEnemy = false;
    let hasAdjEmpty = false;
    let friends = null;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const tarmies = t.armies;
      if (tarmies.length === 0) {
        hasAdjEmpty = true;
        continue;
      }
      let f = null;
      let e = 0;
      for (let k = 0; k < tarmies.length; k++) {
        const a = tarmies[k];
        if (a.player.id === pid) f = a;
        else e += a.strength;
      }
      if (e > 0) {
        hasAdjEnemy = true;
        continue;
      }
      if (f && f.strength < f.maxStrength - 0.5) {
        if (!friends) friends = [];
        friends.push({ tile: t, friendly: f });
      }
    }

    // Adjacent enemy or empty: parent handles via Pass 1 / Pass 2.
    if (hasAdjEnemy || hasAdjEmpty) {
      Parent.act(army, game);
      return;
    }

    // No understrength friend to relay into: defer to parent's Pass 3
    // (5x5 stencil walk toward distant enemies) and final fallback.
    if (!friends) {
      Parent.act(army, game);
      return;
    }

    // Pure interior tick: pick the most-pressured understrength
    // friendly and relay if the gradient exceeds our own pressure.
    const myP = scanPressure(tile.stencil5, viewer);
    let best = null;
    let bestP = -Infinity;
    for (let i = 0; i < friends.length; i++) {
      const f = friends[i];
      const p = scanPressure(f.tile.stencil5, viewer);
      if (p > bestP) {
        bestP = p;
        best = f;
      }
    }

    if (best && bestP - myP >= PRESSURE_GRADIENT) {
      const fa = best.friendly;
      const room = fa.maxStrength - fa.strength;
      const power = Math.min(sLimit, room);
      if (power > 0.5) {
        army.attack(best.tile, power);
        return;
      }
    }

    Parent.act(army, game);
  },
};
