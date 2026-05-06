import SlowAndSteady from "./SlowAndSteady.js";

const ATTACKER_BONUS = 1.4;

function computeFriendlyCentroid(game, player) {
  const cacheKey = `_bulwarkFriendlyCentroid_${player.id}`;
  const cache = game[cacheKey];
  if (cache && cache.tick === game.tick) return cache.centroid;
  const map = game.map;
  const w = map.width, h = map.height;
  const armies = game.armies;
  const pid = player.id;
  let count = 0;
  let centroid = null;
  if (map.wrap) {
    const TAU = Math.PI * 2;
    let xCos = 0, xSin = 0, yCos = 0, ySin = 0;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive || a.player.id !== pid) continue;
      const tx = (a.pos.x / w) * TAU;
      const ty = (a.pos.y / h) * TAU;
      xCos += Math.cos(tx); xSin += Math.sin(tx);
      yCos += Math.cos(ty); ySin += Math.sin(ty);
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
      if (!a.alive || a.player.id !== pid) continue;
      sx += a.pos.x; sy += a.pos.y; count++;
    }
    if (count > 0) centroid = { x: sx / count, y: sy / count };
  }
  game[cacheKey] = { tick: game.tick, centroid };
  return centroid;
}

function outwardScores(army, game, centroid) {
  const map = game.map;
  let dx = army.pos.x - centroid.x;
  let dy = army.pos.y - centroid.y;
  if (map.wrap) {
    const w = map.width, h = map.height;
    if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
    if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
  }
  return [-dx, dx, -dy, dy];
}

export default {
  name: "Bulwark",
  author: "shady",
  version: 1,
  description: "Membrane discipline plus Crusader killing: border armies hunt kills, interior pumps strength outward.",
  summary: `A Crusader/Membrane fusion. Every army first tries the same thing
Crusader does — find the strongest adjacent enemy we can beat
(effective strength s-1 multiplied by 1.4 attacker bonus) and
all-in on the kill. This is the mechanism that made Crusader
overtake Trinity: convert kills aggressively rather than ignoring
them.

If no kill is available, the army's role splits by position:

  - BORDER (any non-friendly neighbor: empty or enemy): play
    SlowAndSteady, which performs a balanceAttack on the weakest
    neighbor — controlled, low-variance expansion that doesn't
    overcommit.
  - CYTOPLASM (fully enclosed by friendlies): pump nearly all
    strength into the friendly neighbor furthest from the friendly
    centroid. Interior strength migrates outward into the
    perimeter where it can fight.

Vs. Crusader: same kill priority, but instead of falling back to
Trinity (which sometimes pushes us into friendly stacks), we use
Membrane's hollow-cell discipline to direct interior strength
outward where it can do work. The thesis is that combining
Crusader's offensive edge with Membrane's supply chain should
beat either alone.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;

    let bestKill = null;
    let bestKillStr = -1;
    let isBorder = false;

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
      if (enemy > bestKillStr) { bestKillStr = enemy; bestKill = t; }
    }

    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }

    if (isBorder) {
      SlowAndSteady.act(army, game);
      return;
    }

    const centroid = computeFriendlyCentroid(game, army.player);
    if (!centroid) {
      SlowAndSteady.act(army, game);
      return;
    }
    const scores = outwardScores(army, game, centroid);
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      if (!neighbors[i]) continue;
      if (scores[i] > bestScore) { bestScore = scores[i]; bestIdx = i; }
    }
    if (bestIdx < 0) return;
    const power = army.attackPower;
    if (power > 0.5) army.attack(neighbors[bestIdx], power);
  },
};
