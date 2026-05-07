import Membrane from "./Membrane.js";

const BONUS = 1.4;
const OPPOSITE = [1, 0, 3, 2];

// Parent Membrane_g1_b9f1d5 inherits Membrane's "pick the strongest
// beatable enemy and throw army.attackPower at it" rule. With BONUS=1.4
// at maxArmy=6, a strength-6 attacker punching a strength-6 defender
// leaves only 6 - 6/1.4 = 1.7 strength on the conquered tile - a
// salient that counter-falls trivially. That all-in policy shows up in
// the parent's season-5 record:
//   * 2 of 5 losses ended at the 4000-tick cap (front oscillation, no
//     way to consolidate captures because every kill ends in 1-2
//     strength on the new tile).
//   * 2 of 5 were direct H2H losses to Conqueror_g2_6b59e8, whose
//     entire edge over Conqueror_g1 is exactly the policy below:
//     minimum-overkill kills - send enemy/BONUS + 0.6, keep the
//     surplus for next tick.
//   * 1 was a finish #2 vs the same Conqueror_g2 - close, but again
//     beaten on territorial sustain.
//
// This descendant keeps everything that worked for the parent (the
// extreme move tech 90/0/2/4/4, the BFS cytoplasm-toward-membrane
// flow) and only swaps the membrane's enemy-selection rule for the
// Conqueror policy. Cytoplasm pumping is unchanged - that's still
// "fill the membrane" and it's already a transfer to a friendly,
// where dumping attackPower is correct (it merges, no surplus
// wasted). Empty captures are also unchanged - the strength you
// commit to an empty tile becomes the new garrison there, so big
// is good. The change is surgical: only the membrane's contested
// attack switches from greedy-strongest to minimum-overkill-weakest.

function hasFriendlyArmy(tile, pid) {
  const a = tile.armies;
  for (let k = 0; k < a.length; k++) if (a[k].player.id === pid) return true;
  return false;
}

function computeMembraneFlow(game, player) {
  const key = `_membraneFlow_${player.id}`;
  const cache = game[key];
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
    if (isMembrane) { flow.set(t, -1); queue.push(t); }
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
  game[key] = { tick: game.tick, flow };
  return flow;
}

export default {
  name: "Membrane_g2_86704b",
  author: "claude",
  version: 1,
  description: "Membrane (move 90/0/2/4/4) with minimum-overkill kills on the membrane.",
  summary: `Parent Membrane_g1_b9f1d5 keeps Membrane's "strongest
beatable enemy + all-in" policy, which leaves ~1.7 strength on a
conquered tile after a 6-vs-6 punch and is the visible failure mode
in 4 of 5 season-5 losses. This descendant inherits the parent's
tech (90/0/2/4/4) and BFS cytoplasm flow unchanged, but the
membrane's contested attack now uses the Conqueror_g2_6b59e8 rule
that beat the parent head-to-head: pick the weakest beatable enemy,
commit only enemy/BONUS + 0.6, keep the rest as garrison for the
next tick. Cytoplasm pumping and empty-tile capture are unchanged
because both already commit to a friendly destination, where full
power is correct.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const flow = computeMembraneFlow(game, army.player);
    const dir = flow.get(tile);

    // Cytoplasm: pump toward membrane (parent behavior, unchanged).
    if (dir !== -1 && dir !== undefined) {
      const target = tile.neighbors[dir];
      if (!target) return;
      const power = army.attackPower;
      if (power > 0.5) army.attack(target, power);
      return;
    }

    // Membrane: minimum-overkill selection, weakest beatable enemy first.
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    let killTile = null;
    let killNeed = 0;
    let killEnemy = Infinity;
    let emptyTile = null;
    for (let d = 0; d < 4; d++) {
      const nt = neighbors[d];
      if (!nt) continue;
      const arms = nt.armies;
      if (arms.length === 0) {
        if (!emptyTile) emptyTile = nt;
        continue;
      }
      let enemySum = 0;
      let friendly = false;
      for (let i = 0; i < arms.length; i++) {
        const a = arms[i];
        if (a.player.id === pid) { friendly = true; break; }
        enemySum += a.strength;
      }
      if (friendly || enemySum <= 0) continue;
      const needed = enemySum / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemySum < killEnemy) {
        killEnemy = enemySum;
        killNeed = needed;
        killTile = nt;
      }
    }

    if (killTile) {
      army.attack(killTile, killNeed);
      return;
    }
    if (emptyTile) {
      army.attack(emptyTile, sLimit);
      return;
    }
    // No beatable enemy, no empty - delegate to parent. Membrane.act
    // will see dir === -1, call pickEnemyToAttack (also returns null
    // here), then fall through to SlowAndSteady's friendly balancing.
    Membrane.act(army, game);
  },
};
