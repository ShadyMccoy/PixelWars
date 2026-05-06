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

// SlowAndSteady refuses to attack unless enemy + 1 < self.strength, which
// at maxArmy=6 means parity stalemates forever. The engine's attackerBonus
// rule means a strength-S attacker beats a strength-D defender whenever
// S * bonus > D, leaving S - D/bonus actual strength on the conquered tile.
// To survive (>= 1) the threshold is S >= 1 + D/bonus. Use that here so
// the membrane can break through equally-matched defenders instead of
// hanging out at the edge of its cell.
function pickEnemyToAttack(army, game) {
  const tile = army.tile;
  const neighbors = tile.neighbors;
  const pid = army.player.id;
  const bonus = game.attackerBonus || 1;
  const myStrength = army.strength;
  let bestTile = null;
  let bestEnemy = -Infinity;
  let bestEmpty = null;
  for (let d = 0; d < 4; d++) {
    const nt = neighbors[d];
    if (!nt) continue;
    const arms = nt.armies;
    if (arms.length === 0) {
      if (!bestEmpty) bestEmpty = nt;
      continue;
    }
    let enemySum = 0;
    let friendly = false;
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i];
      if (a.player.id === pid) { friendly = true; break; }
      enemySum += a.strength;
    }
    if (friendly) continue;
    // Pick the strongest enemy we can still beat with the bonus — taking
    // out a beefy stack swings the board far harder than chipping the
    // weakest neighbor.
    if (myStrength >= 1 + enemySum / bonus && enemySum > bestEnemy) {
      bestEnemy = enemySum;
      bestTile = nt;
    }
  }
  return bestTile || bestEmpty;
}

export default {
  name: "Membrane",
  author: "shady",
  version: 3,
  description: "Cell-membrane: interior armies push outward to the membrane; border armies engage with attacker-bonus aggression.",
  summary: `Inspired by a cell: keep mass on the borders to deter attack,
but spread the body across as much territory as possible. An army
with any non-friendly neighbor — empty tile or enemy — is on the
membrane and fights the actual war. An army fully enclosed by
friendlies is "cytoplasm" and pumps nearly all of its strength one
step toward the nearest membrane tile, leaving itself at minimum
strength to regrow next tick. Direction is found by a per-tick BFS
from the membrane inward, so it depends only on the cluster's
topology — there is no centroid, no notion of "outward from a
point", and the map's coordinate origin / wrap seam is irrelevant.

Membrane combat exploits the engine's attacker-bonus rule directly.
SlowAndSteady refuses any attack that doesn't strictly out-strength
the defender, so two max-strength fronts stalemate forever. Here the
membrane attacks the strongest enemy stack it can still beat with
the bonus (S >= 1 + D/bonus, leaving S - D/bonus alive on the
conquered tile), so a strength-6 attacker happily punches through a
strength-6 defender instead of hanging out at the edge of its cell.
Falls through to SlowAndSteady's friendly-balancing only when no
enemy or empty neighbor is available.

Known weaknesses: early game, almost every army is a border army,
so before we have a real interior we are mostly fighting locally.
Against a Berserker that punches a hole through the membrane, the
breach itself becomes the nearest membrane for nearby cytoplasm and
gets fed — but the patching still happens via border-mode fighting.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const flow = computeMembraneFlow(game, army.player);
    const dir = flow.get(tile);

    // -1 = membrane, undefined = not in flow (shouldn't happen for an
    // alive army's own tile, but be safe).
    if (dir === -1 || dir === undefined) {
      const target = pickEnemyToAttack(army, game);
      if (target && army.strength > 1) {
        army.attack(target, army.attackPower);
        return;
      }
      SlowAndSteady.act(army, game);
      return;
    }

    // Cytoplasm: pump (strength - 1) one step toward the membrane.
    const target = tile.neighbors[dir];
    if (!target) return;
    const power = army.attackPower;
    if (power > 0.5) army.attack(target, power);
  },
};
