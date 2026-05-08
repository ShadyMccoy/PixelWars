import { sumStrength } from "../core/Army.js";
import Parent from "./Conqueror_g13_b41df9.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

// Same chassis as Conqueror_g13_b41df9 with one change in Pass 1:
// instead of committing the closed-form min-overkill (enemy/BONUS +
// MARGIN), commit the army's full attackPower clamped by the
// engine's budget rule. Under Lanchester combat the surplus is
// preserved as raw strength on the captured tile (sqrt(W^2 - L^2)
// >> W - L for W >> L), and under cost = power*dist+1 the +1
// overhead is paid once whether we send 1.5 or 8 strength — so
// max-commit is strictly more efficient per move.
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

export default {
  name: "Hammer",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis with Pass 1 max-commit: pick the best adjacent kill via hemisphere/territory scoring, then commit attackPower (engine clamps to budget). Lanchester preserves the surplus; cost-formula's +1 overhead is paid once per move regardless of size.",
  summary: `Conqueror's chassis under linear+classic was tuned to
commit exactly enemy/1.4 + 0.45 — saves strength for the next
tick. Under combatModel="lanchester" + cost = power*dist+1, that
calculus inverts:

  - Lanchester: sqrt(W^2 - L^2) preserves vastly more strength
    when W >> L. The surplus you commit comes back as raw post-
    fight strength on the captured tile, ready for follow-up.
  - Cost formula: each move pays +1 overhead. Sending 1.5 power
    costs 2.5; sending 8 power costs 9. Per delivered strength,
    the big move is much cheaper.

Hammer keeps Conqueror_g13's Pass 1 kill scorer (hemisphere
backing + territory friendly weight + retake veto) to pick the
best target, but commits the army's full attackPower instead of
min-overkill. The engine clamps to budget automatically, so on
low-budget ticks Hammer behaves like the chassis; on full-budget
ticks Hammer dumps decisively and the captured tile lands with
much more raw strength left over.

Pass 2 (no kill, has expand/reinforce target) and Pass 3 (stencil
stalemate) are inherited unchanged from Parent — they're not the
locus of the over-commit thesis and the chassis already handles
those cases well.

Tech mirrors g14_8d5369's validated chassis loadout {move:76,
stack:0, prod:16, atk:5, def:3} so the comparison isolates the
strategic delta — max-commit on Pass 1 — from any tech tuning.`,
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

    let bestKill = null;
    let bestScore = -Infinity;
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
        // Beatable check stays at min-overkill — we still need
        // sLimit >= the bare-minimum to win. We just don't commit
        // only that minimum.
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;

        let backup = 0;
        let friend = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0, tnF = 0;
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
        const score = enemy
          + BACKING_WEIGHT * backing
          - RETAKE_W * backup
          + FRIENDLY_W * friend;
        if (score > bestScore) {
          bestScore = score;
          bestKill = t;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }

    if (bestKill) {
      // Max commit instead of min-overkill. Engine clamps to
      // budget; Lanchester preserves the surplus.
      army.attack(bestKill, sLimit);
      return;
    }

    // No adjacent kill — defer to chassis for stencil-based moves
    // and reinforcements. The chassis handles those cases well;
    // the over-commit thesis only applies to kills.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }
    Parent.act(army, game);
  },
};
