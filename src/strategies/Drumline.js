import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;
// Phase length: how many ticks the wave direction stays committed
// before recomputation. Pinwheel's PHASE_TICKS=4 lets a single push
// propagate two tiles deep before redirecting; same value here.
const PHASE_TICKS = 4;
// Wave bonus added to a kill candidate's score when its direction
// matches the wave. Calibrated to be ~half a typical strength unit:
// it tiebreaks among comparable kills (e.g. a 1.0-strength target
// in the wave dir vs a 1.0 target perpendicular) without overriding
// genuinely better kills (a 2.0-strength target in a perpendicular
// direction still wins on enemy + backing).
const WAVE_BONUS = 0.5;

const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

function getWaveDir(game, viewer) {
  const cache = game._drumlineCache || (game._drumlineCache = new Map());
  const slot = cache.get(viewer.id);
  if (slot && game.tick - slot.phaseStart < PHASE_TICKS) return slot.dir;
  const dir = computeWaveDir(game, viewer);
  cache.set(viewer.id, { phaseStart: game.tick, dir });
  return dir;
}

function computeWaveDir(game, viewer) {
  const armies = game.armies;
  const w = game.map.width;
  const h = game.map.height;
  const players = game.players.list;
  const cents = new Map();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.totals || (p.totals.armies | 0) === 0) continue;
    cents.set(p.id, { anchor: null, wx: 0, wy: 0, sum: 0 });
  }
  if (!cents.has(viewer.id)) return -1;
  for (let i = 0; i < armies.length; i++) {
    const a = armies[i];
    if (!a.alive) continue;
    const c = cents.get(a.player.id);
    if (!c) continue;
    if (!c.anchor) c.anchor = a.pos;
    let dx = a.pos.x - c.anchor.x;
    let dy = a.pos.y - c.anchor.y;
    if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
    if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
    c.wx += dx * a.strength;
    c.wy += dy * a.strength;
    c.sum += a.strength;
  }
  const me = cents.get(viewer.id);
  if (!me || me.sum === 0) return -1;
  const myCx = me.anchor.x + me.wx / me.sum;
  const myCy = me.anchor.y + me.wy / me.sum;
  let target = null;
  let bestD2 = Infinity;
  for (const [pid, c] of cents.entries()) {
    if (pid === viewer.id) continue;
    if (c.sum === 0) continue;
    const cx = c.anchor.x + c.wx / c.sum;
    const cy = c.anchor.y + c.wy / c.sum;
    let dx = cx - myCx, dy = cy - myCy;
    if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
    if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; target = { dx, dy }; }
  }
  if (!target) return -1;
  if (Math.abs(target.dx) < 0.5 && Math.abs(target.dy) < 0.5) return -1;
  if (Math.abs(target.dx) >= Math.abs(target.dy)) return target.dx < 0 ? 0 : 1;
  return target.dy < 0 ? 2 : 3;
}

export default {
  name: "Drumline",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13's chassis with the wave injected as a kill-pick tiebreaker: among similarly-scored adjacent kills, prefer the one in the closest opponent's direction so frontier armies converge into a coordinated push.",
  summary: `Cross-era data showed that Pinwheel — a primitive
fixed-rotation sync bot from g0 — still beats the lineage's current
champion 33% of the time pairwise. Wave compounding is real but
hard to graft onto Conqueror's chassis. Three earlier Drumline
drafts failed instructively:

  v1 mixed wave bias into the kill score uniformly — kills always
  outranked the bias, so the wave never fired (final 34.9%).
  v2 tried wave first and fell through — gave away every adjacent
  kill, lost the field 25.7%.
  v3 used wave only on non-kill ticks — Conqueror's stencil kernel
  is already a smarter non-kill picker than a global cardinal,
  losing 28.9%.

The lesson: replacing any of Conqueror's decisions with a less-
informed wave is strictly worse. The wave can only help where it
breaks ties Conqueror's kernel doesn't already handle: among
similarly-scored adjacent kills.

Mechanism: this version inlines Conqueror_g13_b41df9's Pass 1
hemisphere/territory kill picker and adds a small WAVE_BONUS=0.5
to the score when the candidate kill is in the wave direction.
That's about half a strength unit — enough to tiebreak among
comparable kills (1.0-strength target in wave dir vs 1.0
perpendicular) but small enough that a genuinely-better kill (2.0
strength on a different direction with strong backing) still
wins. Pass 2 (no kill, has expand/reinforce target) and Pass 3
(stencil-based stalemate) defer entirely to the parent chassis,
which handles those cases cleanly without a wave term.

The wave direction is the cardinal of (closest live opponent's
centroid - our centroid) on the wrap-aware torus, recomputed at
every PHASE_TICKS=4 boundary. Closest, not strongest: the wave
only compounds when there's a real frontier in front of it,
which by definition lives between us and our nearest neighbor.

Tech mirrors g20_43253a's cross-era champion loadout
{move:76, stack:0, prod:16, atk:5, def:3} so the comparison
isolates the strategic delta — wave-aware kill tiebreaks — from
the tech optimization the lineage has spent 20 generations on.

If this still loses to the parent, the conclusion is that
Conqueror's kill scorer is calibrated tightly enough that even a
0.5 wave bonus distorts more pairs than it tiebreaks usefully —
the lineage has already converged onto a kill ordering that
implicitly captures coordination. In that case the next iteration
should either drop WAVE_BONUS toward 0.2, or pivot to a different
axis entirely (e.g. pre-emptive retreat of soon-to-die armies via
attacking backwards into a friendly with room).`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Conqueror.act(army, game);
      return;
    }
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const waveDir = getWaveDir(game, viewer);

    let bestKill = null;
    let bestScore = -Infinity;
    let bestNeeded = 0;
    let hasOtherTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasOtherTarget = true; continue; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;

        let backup = 0;
        let friend = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0;
          let tnF = 0;
          for (let k = 0; k < ttArmies.length; k++) {
            const a = ttArmies[k];
            if (a.player.id === pid) tnF += a.strength;
            else tnE += a.strength;
          }
          if (tnE > backup) backup = tnE;
          if (tnF > friend) friend = tnF;
        }
        if (backup >= RETAKE_VETO) continue;

        let backing = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) backing += e;
          }
        }

        let score = enemy
          + BACKING_WEIGHT * backing
          - RETAKE_W * backup
          + FRIENDLY_W * friend;
        if (i === waveDir) score += WAVE_BONUS;
        if (score > bestScore) {
          bestScore = score;
          bestNeeded = needed;
          bestKill = t;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // No kill on the table. Defer entirely to Conqueror's kernel-based
    // non-kill logic — it picks expansion/reinforcement targets via
    // 5x5 alignment scoring, which is consistently better than a
    // global cardinal in this lineage's match data.
    Conqueror.act(army, game);
  },
};
