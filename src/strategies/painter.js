// Shared "strategic map" painter helpers. Each painter labels every
// tile owned by a player with a role + a BFS depth toward some goal,
// so per-army act() functions can dispatch on role instead of making
// purely local decisions.
//
// The plan is cached on the Game object keyed by player id + tick, so
// the first army of a player to act on a given tick pays the painter
// cost once and every subsequent army of that player reads the cache.

// Roles. Int8 codes so we can store them in a Uint8Array per tile.
export const ROLE_NONE = 0;       // tile not owned by us
export const ROLE_FRONT = 1;      // friendly, has at least one non-friendly neighbor (push outward)
export const ROLE_INTERIOR = 2;   // friendly, fully enclosed by friends (pump toward front)
export const ROLE_SINK = 3;       // friendly border tile under heavy enemy pressure (hold)
export const ROLE_SORTIE = 4;     // friendly tile picked as the sole attack front (Citadel-Sortie)
export const ROLE_CORE = 5;       // friendly tile inside the fortified core (stockpile)

// Treat a tile as "friendly to pid" if its first registered army (if
// any) belongs to pid. This matches how `recomputeTerritory` decides
// ownership and is cheap. Multi-army tiles before resolveConflicts
// may briefly mislabel, but that washes out tick-to-tick.
function tileOwner(tile) {
  const a = tile.armies[0];
  return a ? a.player.id : 0;
}

function enemyStrengthOnTile(tile, pid) {
  let s = 0;
  const armies = tile.armies;
  for (let i = 0; i < armies.length; i++) {
    const a = armies[i];
    if (a.player.id !== pid) s += a.strength;
  }
  return s;
}

// BFS over friendly tiles starting from `seedIdxs`. Writes depth into
// `depth` (already sized to tiles.length, -1 default), and returns it.
function bfsDepth(map, friendlyMask, seedIdxs, depth) {
  const tiles = map.tiles;
  const queue = seedIdxs.slice();
  let head = 0;
  for (let i = 0; i < seedIdxs.length; i++) depth[seedIdxs[i]] = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const t = tiles[idx];
    const d = depth[idx];
    const neighbors = t.neighbors;
    for (let k = 0; k < 4; k++) {
      const n = neighbors[k];
      if (!n) continue;
      const ni = n.pos.y * map.width + n.pos.x;
      if (!friendlyMask[ni]) continue;
      if (depth[ni] !== -1) continue;
      depth[ni] = d + 1;
      queue.push(ni);
    }
  }
  return depth;
}

// Frontier painter: roles = FRONT for friendly tiles bordering anything
// non-friendly, INTERIOR otherwise. Depth = BFS distance from front.
//
// Returns { roles: Uint8Array, depth: Int16Array, friendly: Uint8Array, fronts: number[] }.
export function paintFrontier(game, player) {
  const cacheKey = `_frontierPlan_${player.id}`;
  const cached = game[cacheKey];
  if (cached && cached.tick === game.tick) return cached.plan;

  const map = game.map;
  const tiles = map.tiles;
  const N = tiles.length;
  const pid = player.id;

  const friendly = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (tileOwner(tiles[i]) === pid) friendly[i] = 1;
  }

  const roles = new Uint8Array(N);
  const fronts = [];
  for (let i = 0; i < N; i++) {
    if (!friendly[i]) continue;
    const t = tiles[i];
    const n = t.neighbors;
    let isFront = false;
    for (let k = 0; k < 4; k++) {
      const nb = n[k];
      if (!nb) { isFront = true; break; }
      const ni = nb.pos.y * map.width + nb.pos.x;
      if (!friendly[ni]) { isFront = true; break; }
    }
    if (isFront) {
      roles[i] = ROLE_FRONT;
      fronts.push(i);
    } else {
      roles[i] = ROLE_INTERIOR;
    }
  }

  const depth = new Int16Array(N).fill(-1);
  bfsDepth(map, friendly, fronts, depth);

  const plan = { roles, depth, friendly, fronts };
  game[cacheKey] = { tick: game.tick, plan };
  return plan;
}

// Pressure-Sink painter: same skeleton as Frontier, but border tiles are
// further split into ROLE_FRONT (attack — low enemy pressure) vs
// ROLE_SINK (hold — high enemy pressure). Depth gradient is computed
// from FRONT tiles only, so interior strength flows toward the seams.
//
// `pressureCutoff` is a fraction in (0,1]: tiles with adjacent enemy
// strength <= cutoff * maxAdjacent become attack fronts; the rest are
// sinks. With cutoff=0.5 you get "attack the easier half of the
// border, brace the harder half".
export function paintPressureSink(game, player, pressureCutoff = 0.5) {
  const cacheKey = `_pressureSinkPlan_${player.id}`;
  const cached = game[cacheKey];
  if (cached && cached.tick === game.tick) return cached.plan;

  const map = game.map;
  const tiles = map.tiles;
  const N = tiles.length;
  const pid = player.id;

  const friendly = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (tileOwner(tiles[i]) === pid) friendly[i] = 1;
  }

  // First pass: find all border tiles + their enemy pressure.
  const roles = new Uint8Array(N);
  const borderIdxs = [];
  const borderPressure = [];
  let maxPressure = 0;
  for (let i = 0; i < N; i++) {
    if (!friendly[i]) continue;
    const t = tiles[i];
    const n = t.neighbors;
    let pressure = 0;
    let isBorder = false;
    for (let k = 0; k < 4; k++) {
      const nb = n[k];
      if (!nb) { isBorder = true; continue; }
      const ni = nb.pos.y * map.width + nb.pos.x;
      if (!friendly[ni]) {
        isBorder = true;
        pressure += enemyStrengthOnTile(nb, pid);
      }
    }
    if (isBorder) {
      borderIdxs.push(i);
      borderPressure.push(pressure);
      if (pressure > maxPressure) maxPressure = pressure;
    } else {
      roles[i] = ROLE_INTERIOR;
    }
  }

  // Split borders into FRONT (low pressure → attack) vs SINK (high → hold).
  // If maxPressure is 0 (no enemy adjacent — only empty tiles), every
  // border becomes a FRONT, which is what we want.
  const threshold = maxPressure * pressureCutoff;
  const fronts = [];
  for (let i = 0; i < borderIdxs.length; i++) {
    const idx = borderIdxs[i];
    if (borderPressure[i] <= threshold) {
      roles[idx] = ROLE_FRONT;
      fronts.push(idx);
    } else {
      roles[idx] = ROLE_SINK;
    }
  }

  // If the cutoff happened to exclude every border (e.g. all border
  // tiles tie at maxPressure), fall back to making them all fronts.
  if (fronts.length === 0 && borderIdxs.length > 0) {
    for (let i = 0; i < borderIdxs.length; i++) {
      const idx = borderIdxs[i];
      roles[idx] = ROLE_FRONT;
      fronts.push(idx);
    }
  }

  const depth = new Int16Array(N).fill(-1);
  bfsDepth(map, friendly, fronts, depth);

  const plan = { roles, depth, friendly, fronts };
  game[cacheKey] = { tick: game.tick, plan };
  return plan;
}

// Citadel-Sortie painter:
//   1. Pick a rival to focus on. Target stays the same as last tick
//      unless that rival is dead, or a new candidate is meaningfully
//      weaker (hysteresis: switchMargin). Without this, the sortie
//      direction flickers tick-to-tick and interior flow never
//      reaches its destination.
//   2. Sortie tiles = sortieWidth friendly border tiles closest to
//      that rival's centroid; marked ROLE_SORTIE.
//   3. Core = friendly tiles within Manhattan radius coreRadius of
//      our centroid → ROLE_CORE.
//   4. Border tiles that are neither core nor sortie → ROLE_FRONT.
//   5. Interior tiles → ROLE_INTERIOR with BFS depth from sortie,
//      so supply flows to the sortie rather than uniformly outward.
export function paintCitadelSortie(game, player, opts = {}) {
  const sortieWidth = opts.sortieWidth ?? 2;
  const coreRadius = opts.coreRadius ?? 2;
  const switchMargin = opts.switchMargin ?? 0.7; // new target must be <70% of current target's strength to switch
  const cacheKey = `_citadelSortiePlan_${player.id}`;
  const cached = game[cacheKey];
  if (cached && cached.tick === game.tick) return cached.plan;

  const map = game.map;
  const tiles = map.tiles;
  const N = tiles.length;
  const pid = player.id;
  const w = map.width;
  const h = map.height;

  const friendly = new Uint8Array(N);
  let sumX = 0, sumY = 0, count = 0;
  for (let i = 0; i < N; i++) {
    if (tileOwner(tiles[i]) === pid) {
      friendly[i] = 1;
      const t = tiles[i];
      sumX += t.pos.x; sumY += t.pos.y; count++;
    }
  }

  const roles = new Uint8Array(N);
  if (count === 0) {
    const plan = { roles, depth: new Int16Array(N).fill(-1), friendly, fronts: [] };
    game[cacheKey] = { tick: game.tick, plan };
    return plan;
  }

  // First find the set of *adjacent* enemy player ids — rivals whose
  // territory actually touches ours. Going after the globally-weakest
  // enemy ignores the bot currently crushing us; "adjacent + weakest"
  // is what concentration is supposed to mean.
  const adjacentIds = new Set();
  for (let i = 0; i < N; i++) {
    if (!friendly[i]) continue;
    const t = tiles[i];
    const n = t.neighbors;
    for (let k = 0; k < 4; k++) {
      const nb = n[k];
      if (!nb) continue;
      const ni = nb.pos.y * w + nb.pos.x;
      if (friendly[ni]) continue;
      const armies = nb.armies;
      for (let m = 0; m < armies.length; m++) {
        const a = armies[m];
        if (a.player.id !== pid) adjacentIds.add(a.player.id);
      }
    }
  }

  // Pick a rival, with hysteresis. Prefer adjacent enemies. Stay
  // locked onto last tick's target unless they're dead, no longer
  // adjacent, or a new candidate is meaningfully weaker.
  const players = game.players.list;
  const prevTargetId = cached?.plan?.target ?? null;
  let target = null;
  let targetStr = Infinity;
  let weakestAdj = null;
  let weakestAdjStr = Infinity;
  let weakestAny = null;
  let weakestAnyStr = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.id === pid) continue;
    if (p.totals.armies <= 0) continue;
    const s = p.totals.strength;
    if (s < weakestAnyStr) { weakestAnyStr = s; weakestAny = p; }
    if (adjacentIds.has(p.id)) {
      if (s < weakestAdjStr) { weakestAdjStr = s; weakestAdj = p; }
      if (p.id === prevTargetId) { target = p; targetStr = s; }
    }
  }
  // Locked target is no longer adjacent (or dead) → pick fresh.
  if (!target) {
    target = weakestAdj ?? weakestAny;
    targetStr = target ? (target === weakestAdj ? weakestAdjStr : weakestAnyStr) : Infinity;
  } else if (weakestAdj && weakestAdj.id !== target.id && weakestAdjStr < targetStr * switchMargin) {
    target = weakestAdj;
    targetStr = weakestAdjStr;
  }

  // For every friendly border tile, score it by closeness to the target
  // enemy's centroid (lower = closer = better sortie). If there's no
  // target, score by closeness to ANY non-friendly tile.
  let tcx = 0, tcy = 0, tcount = 0;
  if (target) {
    const tid = target.id;
    const armies = game.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive || a.player.id !== tid) continue;
      tcx += a.pos.x; tcy += a.pos.y; tcount++;
    }
  }
  const haveTargetCentroid = tcount > 0;
  if (haveTargetCentroid) { tcx /= tcount; tcy /= tcount; }

  const borderIdxs = [];
  for (let i = 0; i < N; i++) {
    if (!friendly[i]) continue;
    const t = tiles[i];
    const n = t.neighbors;
    let isBorder = false;
    for (let k = 0; k < 4; k++) {
      const nb = n[k];
      if (!nb) { isBorder = true; break; }
      const ni = nb.pos.y * w + nb.pos.x;
      if (!friendly[ni]) { isBorder = true; break; }
    }
    if (isBorder) borderIdxs.push(i);
  }

  // Pick sortieWidth border tiles closest to target.
  function dist(idx) {
    const t = tiles[idx];
    let dx = t.pos.x - (haveTargetCentroid ? tcx : sumX / count);
    let dy = t.pos.y - (haveTargetCentroid ? tcy : sumY / count);
    if (map.wrap) {
      if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
      if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
    }
    return dx * dx + dy * dy;
  }
  borderIdxs.sort((a, b) => dist(a) - dist(b));
  const sorties = borderIdxs.slice(0, Math.min(sortieWidth, borderIdxs.length));

  // Borders default to FRONT; non-border friendly tiles become CORE
  // if they're inside the citadel radius of our centroid, else
  // INTERIOR. Borders are NEVER core: a tile that can fight should
  // fight, not stockpile.
  const cx = sumX / count;
  const cy = sumY / count;
  const borderSet = new Uint8Array(N);
  for (let i = 0; i < borderIdxs.length; i++) borderSet[borderIdxs[i]] = 1;
  for (let i = 0; i < N; i++) {
    if (!friendly[i]) continue;
    if (borderSet[i]) { roles[i] = ROLE_FRONT; continue; }
    const t = tiles[i];
    let dx = t.pos.x - cx;
    let dy = t.pos.y - cy;
    if (map.wrap) {
      if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
      if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
    }
    const md = Math.abs(dx) + Math.abs(dy);
    roles[i] = md <= coreRadius ? ROLE_CORE : ROLE_INTERIOR;
  }
  for (let i = 0; i < sorties.length; i++) {
    roles[sorties[i]] = ROLE_SORTIE;
  }

  const depth = new Int16Array(N).fill(-1);
  bfsDepth(map, friendly, sorties, depth);

  const plan = { roles, depth, friendly, fronts: sorties, target: target?.id ?? null };
  game[cacheKey] = { tick: game.tick, plan };
  return plan;
}

// Convenience: pick the friendly neighbor with the lowest BFS depth
// (i.e. closest to a "front" seed). Used by the executors for interior
// armies that should flow toward fighting.
export function lowestDepthFriendlyNeighbor(army, plan) {
  const tile = army.tile;
  if (!tile) return null;
  const map = army.game.map;
  const w = map.width;
  const neighbors = tile.neighbors;
  const depth = plan.depth;
  const friendly = plan.friendly;
  let best = null;
  let bestDepth = Infinity;
  for (let k = 0; k < 4; k++) {
    const n = neighbors[k];
    if (!n) continue;
    const ni = n.pos.y * w + n.pos.x;
    if (!friendly[ni]) continue;
    const d = depth[ni];
    if (d < 0) continue;
    if (d < bestDepth) { bestDepth = d; best = n; }
  }
  return best;
}

// Try to kill any winnable adjacent enemy with attacker bonus; returns
// true if an attack happened. Mirrors the Crusader/Spearhead opening
// move, factored out so painter-based bots all share it.
export function tryKillAdjacent(army, attackerBonus = 1.4) {
  const tile = army.tile;
  if (!tile) return false;
  const neighbors = tile.neighbors;
  const pid = army.player.id;
  const myEff = (army.strength - 1) * attackerBonus;

  let bestKill = null;
  let bestKillStr = -1;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const armies = t.armies;
    if (armies.length === 0) continue;
    let enemy = 0;
    let friendly = false;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) { friendly = true; break; }
      enemy += a.strength;
    }
    if (friendly || enemy <= 0) continue;
    if (myEff <= enemy) continue;
    if (enemy > bestKillStr) { bestKillStr = enemy; bestKill = t; }
  }
  if (bestKill) {
    army.attack(bestKill, army.strength - 1);
    return true;
  }
  return false;
}
