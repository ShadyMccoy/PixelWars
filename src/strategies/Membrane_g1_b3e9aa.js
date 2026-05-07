import SlowAndSteady from "./SlowAndSteady.js";

const OPPOSITE = [1, 0, 3, 2];

function hasFriendlyArmy(tile, pid) {
  const a = tile.armies;
  for (let k = 0; k < a.length; k++) {
    if (a[k].player.id === pid) return true;
  }
  return false;
}

function computeMembraneFlow(game, player) {
  const cacheKey = `_membraneFlow_b3e9aa_${player.id}`;
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
      if (!nt) continue;
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
      flow.set(nt, OPPOSITE[d]);
      queue.push(nt);
    }
  }

  game[cacheKey] = { tick: game.tick, flow };
  return flow;
}

// Pick a membrane attack target. Prefer killing the strongest beatable
// enemy (parent's idea — disrupting big stacks swings the board) but
// tie-break by residual strength so we don't scrape past with ~0 left
// on a tile that'll flip back next tick.
function pickMembraneTarget(army, game) {
  const tile = army.tile;
  const neighbors = tile.neighbors;
  const pid = army.player.id;
  const bonus = game.attackerBonus || 1;
  const myStrength = army.strength;
  let bestEnemyTile = null;
  let bestEnemyScore = -Infinity;
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
    if (myStrength >= 1 + enemySum / bonus) {
      const residual = myStrength - enemySum / bonus;
      const score = enemySum + residual * 0.1;
      if (score > bestEnemyScore) {
        bestEnemyScore = score;
        bestEnemyTile = nt;
      }
    }
  }
  return bestEnemyTile || bestEmpty;
}

export default {
  name: "Membrane_g1_b3e9aa",
  author: "shady",
  version: 1,
  description: "Membrane with atk-investing tech and residual-aware combat scoring.",
  summary: `Descendant of Membrane. Two changes from the parent:

1) Tech rebalanced from {move:30, stack:0, prod:30, atk:0, def:40}
   to {move:25, stack:15, prod:25, atk:25, def:10}. Baseline for
   stack/prod/atk/def is tech 20 (= 1.0x), so the parent ran atk
   and stack BELOW baseline. Against a Spearhead-class opponent
   that explicitly leverages the 1.4x attacker bonus, the membrane
   front-liners didn't have the punch to crack symmetric defenders.
   Loss context: parent finished #4/6 in season #4 with Spearhead
   winning. Pulling 30 points off def and feeding atk (+25) and
   stack (+15) lifts front-line trade math without abandoning
   regrowth (prod=25, slightly above neutral) or throw weight
   (move=25 → 1.25 garrison floor, still generous).
2) Membrane combat scoring now uses enemy_killed + 0.1*residual as
   a tie-break instead of pure enemy strength. When two enemy
   neighbors look equally tempting, prefer the one we can crush
   cleanly so the conquered tile holds territory rather than
   immediately flipping back at ~0 strength.

Cytoplasm pumping (BFS-driven topological flow to the nearest
membrane tile) is unchanged — that was the parent's strongest
idea. Inheriting the kernel and changing only the combat math +
tech budget keeps the diff small and reviewable.`,
  tech: { move: 25, stack: 15, prod: 25, atk: 25, def: 10 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const flow = computeMembraneFlow(game, army.player);
    const dir = flow.get(tile);

    if (dir === -1 || dir === undefined) {
      const target = pickMembraneTarget(army, game);
      if (target && army.strength > 1) {
        army.attack(target, army.attackPower);
        return;
      }
      SlowAndSteady.act(army, game);
      return;
    }

    const target = tile.neighbors[dir];
    if (!target) return;
    const power = army.attackPower;
    if (power > 0.5) army.attack(target, power);
  },
};
