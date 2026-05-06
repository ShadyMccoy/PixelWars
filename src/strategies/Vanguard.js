import SlowAndSteady from "./SlowAndSteady.js";

function computeEnemyCentroid(game, player) {
  const cacheKey = `_vanguardEnemyCentroid_${player.id}`;
  const cache = game[cacheKey];
  if (cache && cache.tick === game.tick) return cache.centroid;

  const map = game.map;
  const w = map.width;
  const h = map.height;
  const armies = game.armies;
  const pid = player.id;
  let count = 0;
  let centroid = null;

  if (map.wrap) {
    const TAU = Math.PI * 2;
    let xCos = 0, xSin = 0, yCos = 0, ySin = 0;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive || a.player.id === pid) continue;
      const tx = (a.pos.x / w) * TAU;
      const ty = (a.pos.y / h) * TAU;
      xCos += Math.cos(tx);
      xSin += Math.sin(tx);
      yCos += Math.cos(ty);
      ySin += Math.sin(ty);
      count++;
    }
    if (count > 0) {
      const ax = Math.atan2(xSin, xCos);
      const ay = Math.atan2(ySin, yCos);
      const cx = (((ax / TAU) * w) % w + w) % w;
      const cy = (((ay / TAU) * h) % h + h) % h;
      centroid = { x: cx, y: cy };
    }
  } else {
    let sx = 0, sy = 0;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive || a.player.id === pid) continue;
      sx += a.pos.x;
      sy += a.pos.y;
      count++;
    }
    if (count > 0) centroid = { x: sx / count, y: sy / count };
  }

  game[cacheKey] = { tick: game.tick, centroid };
  return centroid;
}

function inwardScores(army, game, centroid) {
  const map = game.map;
  let dx = centroid.x - army.pos.x;
  let dy = centroid.y - army.pos.y;
  if (map.wrap) {
    const w = map.width;
    const h = map.height;
    if (dx > w / 2) dx -= w;
    else if (dx < -w / 2) dx += w;
    if (dy > h / 2) dy -= h;
    else if (dy < -h / 2) dy += h;
  }
  // Neighbor order: 0=W, 1=E, 2=N, 3=S. Score = how much that move
  // takes us toward the enemy centroid.
  return [-dx, dx, -dy, dy];
}

const ATTACKER_BONUS = 1.4;

export default {
  name: "Vanguard",
  author: "shady",
  version: 1,
  description: "Front-line attacks; interior armies funnel strength toward the enemy centroid.",
  summary: `Membrane inverted. Membrane keeps interior strength flowing OUT
from a friendly centroid, so the perimeter fattens uniformly.
Vanguard instead computes the centroid of all ENEMY armies and
pumps interior strength TOWARD that point — so reinforcements
collect on the side of our territory that's actually fighting,
not bleed out into the empty backfield. Border armies (those with
any non-friendly neighbor) play offense: target the strongest
beatable enemy adjacent (factoring the 1.4x attacker bonus), or
else SlowAndSteady. Cytoplasm armies (fully enclosed by
friendlies) dump strength into the friendly neighbor closest to
the enemy centroid.

Thesis: Membrane wins by hollowing out, but its outward flow is
directionless — supply trickles to the wrong side as often as the
right one. Concentrating supply on the contested side should give
a denser front in the same number of ticks. Failure mode: in the
opening when enemies are far away, the centroid is roughly the
map middle and everyone funnels inward to a single tile, which
caps out and stalls. Mitigated by the border check — if an army
sees no friendly neighbor in the inward direction, it falls back
to SlowAndSteady.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let isBorder = false;
    let bestKill = null;
    let bestKillStr = -1;
    const myEff = (army.attackPower) * ATTACKER_BONUS;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) { isBorder = true; continue; }
      const armies = t.armies;
      if (armies.length === 0) { isBorder = true; continue; }
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly = true;
        else enemy += a.strength;
      }
      if (!friendly) isBorder = true;
      if (friendly || enemy <= 0) continue;
      if (myEff <= enemy) continue;
      if (enemy > bestKillStr) {
        bestKillStr = enemy;
        bestKill = t;
      }
    }

    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }
    if (isBorder) {
      SlowAndSteady.act(army, game);
      return;
    }

    const centroid = computeEnemyCentroid(game, army.player);
    if (!centroid) {
      SlowAndSteady.act(army, game);
      return;
    }
    const scores = inwardScores(army, game, centroid);
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id === pid) { friendly = true; break; }
      }
      if (!friendly) continue;
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      SlowAndSteady.act(army, game);
      return;
    }
    const power = army.attackPower;
    if (power > 0.5) army.attack(neighbors[bestIdx], power);
  },
};
