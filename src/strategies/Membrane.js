import SlowAndSteady from "./SlowAndSteady.js";

const OPPOSITE = [1, 0, 3, 2]; // left<->right, up<->down

// For each owned tile, compute the index of the neighbor that is one
// step closer to the membrane (a friendly tile with a non-friendly
// neighbor). Tiles on the membrane themselves get -1. The result is
// purely topological — no coordinates, no centroid, no dependence on
// where x=0 happens to fall.
function computeMembraneFlow(game, player) {
  const cacheKey = `_membraneFlow_${player.id}`;
  const cache = game[cacheKey];
  if (cache && cache.tick === game.tick) return cache.flow;

  const pid = player.id;
  const tiles = game.map.tiles;
  const flow = new Map();
  const queue = [];

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!hasFriendlyArmy(t, pid)) continue;
    const n = t.neighbors;
    let isMembrane = false;
    for (let d = 0; d < 4; d++) {
      const nt = n[d];
      if (!nt) continue; // map edge isn't a threat
      if (!hasFriendlyArmy(nt, pid)) { isMembrane = true; break; }
    }
    if (isMembrane) {
      flow.set(t, -1);
      queue.push(t);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const n = cur.neighbors;
    for (let d = 0; d < 4; d++) {
      const nt = n[d];
      if (!nt || flow.has(nt)) continue;
      if (!hasFriendlyArmy(nt, pid)) continue;
      // nt is a cytoplasm tile; from nt, the direction back to cur (one
      // step closer to membrane) is the opposite of d.
      flow.set(nt, OPPOSITE[d]);
      queue.push(nt);
    }
  }

  game[cacheKey] = { tick: game.tick, flow };
  return flow;
}

function hasFriendlyArmy(tile, pid) {
  const a = tile.armies;
  for (let k = 0; k < a.length; k++) {
    if (a[k].player.id === pid) return true;
  }
  return false;
}

export default {
  name: "Membrane",
  author: "shady",
  version: 2,
  description: "Cell-membrane: interior armies push outward to the membrane; border armies hold and fight.",
  summary: `Inspired by a cell: keep mass on the borders to deter attack,
but spread the body across as much territory as possible. An army
with any non-friendly neighbor — empty tile or enemy — is on the
membrane and plays SlowAndSteady, doing the actual fighting and
expansion. An army fully enclosed by friendlies is "cytoplasm" and
pumps nearly all of its strength one step toward the nearest
membrane tile, leaving itself at minimum strength to regrow next
tick. Direction is found by a per-tick BFS from the membrane
inward, so it depends only on the cluster's topology — there is no
centroid, no notion of "outward from a point", and the map's
coordinate origin / wrap seam is irrelevant. The interior visibly
hollows out while the perimeter fattens — a cell, not a blob. The
thesis: most strategies either go thin-and-wide (easily overrun)
or fat-and-small (easily starved); the membrane wins both axes by
letting interior strength migrate naturally to wherever the front
is.

Known weaknesses: early game, almost every army is a border army,
so before we have a real interior we are just SlowAndSteady. Against
a Berserker that punches a hole through the membrane, the breach
itself becomes the nearest membrane for nearby cytoplasm and gets
fed — but the patching still happens via border-mode fighting.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const flow = computeMembraneFlow(game, army.player);
    const dir = flow.get(tile);

    // -1 = membrane, undefined = not in flow (shouldn't happen for an
    // alive army's own tile, but be safe).
    if (dir === -1 || dir === undefined) {
      SlowAndSteady.act(army, game);
      return;
    }

    // Cytoplasm: pump (strength - 1) one step toward the membrane.
    const target = tile.neighbors[dir];
    if (!target) return;
    const power = army.strength - 1;
    if (power > 0.5) army.attack(target, power);
  },
};
