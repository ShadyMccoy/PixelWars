import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";

const ATTACKER_BONUS = 1.4;

// Per-direction half-plane weights (Tactician's idea): for each cardinal
// direction, the cells of stencil5 that lie on that side of the origin,
// weighted by 1/manhattan-distance.
const HALF_PLANES = [[], [], [], []];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 5; j++) {
    const dy = i - 2;
    const dx = j - 2;
    if (dx === 0 && dy === 0) continue;
    const idx = i * 5 + j;
    const dist = Math.abs(dx) + Math.abs(dy);
    const w = 1 / dist;
    if (dx <= -1) HALF_PLANES[0].push(idx, w);
    if (dx >= 1) HALF_PLANES[1].push(idx, w);
    if (dy <= -1) HALF_PLANES[2].push(idx, w);
    if (dy >= 1) HALF_PLANES[3].push(idx, w);
  }
}

export default {
  name: "TideWall",
  author: "claude",
  version: 1,
  description: "Border armies kill or probe; interior pumps strength toward the half-plane with the most enemy mass.",
  summary: `Membrane reimagined with a directed supply chain. Membrane drains
its interior outward toward whichever neighbor is furthest from the
friendly centroid — purely geometric flow that ignores where the
fighting is actually happening. TideWall keeps the same border /
interior split but adds two improvements:

- BORDER armies (any non-friendly neighbor): first try a Crusader-style
  kill on the strongest beatable adjacent enemy, factoring the engine's
  1.4x attacker bonus so we pick up wins Aggressive's naive check would
  miss. With no kill available, fall back to SlowAndSteady.
- CYTOPLASM armies (fully enclosed by friendlies): pump strength toward
  the half-plane of the 5x5 stencil with the most enemy mass, weighted
  by 1/distance. Reserves flow to the contested side, not symmetrically.

The thesis: in late-game most of the perimeter is quiet. Routing supply
to the hot border via a local enemy gradient, rather than spreading it
omnidirectionally, concentrates force where it can fight. With no
visible enemy in the 5x5 view (clean territory), pump arbitrarily so
strength keeps cycling through the body rather than stalling.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    // Border check + Crusader-style kill priority.
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

    if (army.strength < 1.5) return;

    // Interior: pump toward the half-plane with the most enemy mass.
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
    let bestDir = -1;
    let bestScore = 0;
    for (let d = 0; d < 4; d++) {
      if (!neighbors[d]) continue;
      const offs = HALF_PLANES[d];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        // sumStrength returns friendly - enemy; we want pure enemy magnitude.
        const net = sumStrength(t.armies, viewer);
        if (net < 0) score += offs[n + 1] * (-net);
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = d;
      }
    }

    // No visible enemy in stencil — pump to any friendly neighbor so the
    // body keeps cycling rather than stalling.
    if (bestDir < 0) {
      for (let i = 0; i < 4; i++) {
        if (neighbors[i]) { bestDir = i; break; }
      }
    }
    if (bestDir < 0) return;
    const target = neighbors[bestDir];
    const power = army.attackPower;
    if (power > 0.5) army.attack(target, power);
  },
};
