import { balanceAttack } from "./helpers.js";
import SlowAndSteady from "./SlowAndSteady.js";

function computeCentroid(game, player) {
  const cacheKey = `_membraneCentroid_${player.id}`;
  const cache = game[cacheKey];
  if (cache && cache.tick === game.tick) return cache.centroid;

  const map = game.map;
  const w = map.width;
  const h = map.height;
  const armies = game.armies;
  let count = 0;
  let centroid = null;

  if (map.wrap) {
    const TAU = Math.PI * 2;
    let xCos = 0, xSin = 0, yCos = 0, ySin = 0;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive || a.player.id !== player.id) continue;
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
      if (!a.alive || a.player.id !== player.id) continue;
      sx += a.pos.x;
      sy += a.pos.y;
      count++;
    }
    if (count > 0) centroid = { x: sx / count, y: sy / count };
  }

  game[cacheKey] = { tick: game.tick, centroid };
  return centroid;
}

function outwardGradient(army, game, centroid) {
  const map = game.map;
  let dx = army.pos.x - centroid.x;
  let dy = army.pos.y - centroid.y;
  if (map.wrap) {
    const w = map.width;
    const h = map.height;
    if (dx > w / 2) dx -= w;
    else if (dx < -w / 2) dx += w;
    if (dy > h / 2) dy -= h;
    else if (dy < -h / 2) dy += h;
  }
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const total = ax + ay;
  if (total < 1e-3) {
    const r = Math.floor(game.rng() * 4);
    const g = [0, 0, 0, 0];
    g[r] = 2;
    return g;
  }
  const wx = (ax / total) * 3;
  const wy = (ay / total) * 3;
  return [
    dx < 0 ? wx : 0,
    dx > 0 ? wx : 0,
    dy < 0 ? wy : 0,
    dy > 0 ? wy : 0,
  ];
}

export default {
  name: "Membrane",
  author: "shady",
  version: 1,
  description: "Cell-membrane: interior armies repel from the centroid; border armies hold and fight.",
  summary: `Inspired by a cell: keep mass on the borders to deter attack, but
spread the body across as much territory as possible. Each tick we
compute the centroid of all friendly armies (circular mean on wrap
maps so the wrap seam doesn't break it). An army with any
non-friendly neighbor — empty tile or enemy — is on the membrane and
plays SlowAndSteady, doing the actual fighting and expansion. An
army that is fully enclosed by friendlies is "cytoplasm" and gets
pushed toward whichever outward neighbor has the least resistance,
biased by a gradient pointing away from the centroid (proportional
to its signed offset on each axis). The thesis: most strategies
either go thin-and-wide (easily overrun) or fat-and-small (easily
starved); the membrane wins both axes by letting interior strength
migrate naturally to wherever the front is.

Known weaknesses: early game, almost every army is a border army,
so before we have a real interior we are just SlowAndSteady. Against
a Berserker that punches a hole through the membrane, the centroid
shifts toward the breach and outward flow re-routes — but the
breach itself still has to be patched by border-mode fighting.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let isBorder = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) { isBorder = true; break; }
      const tArmies = t.armies;
      if (tArmies.length === 0) { isBorder = true; break; }
      let friendly = false;
      for (let k = 0; k < tArmies.length; k++) {
        if (tArmies[k].player.id === pid) { friendly = true; break; }
      }
      if (!friendly) { isBorder = true; break; }
    }

    if (isBorder) {
      SlowAndSteady.act(army, game);
      return;
    }

    const centroid = computeCentroid(game, army.player);
    if (!centroid) {
      SlowAndSteady.act(army, game);
      return;
    }
    const gradient = outwardGradient(army, game, centroid);
    const target = army.weakestAdjacent(gradient);
    if (!target) return;
    balanceAttack(army, target);
  },
};
