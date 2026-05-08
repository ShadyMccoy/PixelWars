import { sumStrength } from "../core/Army.js";
import Parent from "./Conqueror_g13_b41df9.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;
// Threshold at which we decide a captured tile faces a fight next
// tick and over-committing pays. Set just below the chassis's
// RETAKE_VETO so we still over-commit on tiles with nontrivial
// enemy backup that the chassis is willing to take anyway.
const FIGHT_THRESHOLD = 0.5;

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
  name: "Forge",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis with conditional max-commit: when the chassis's Pass 1 picks a kill AND the captured tile will face a non-trivial enemy next tick (max-backup >= 0.5), commit attackPower instead of min-overkill. On safe captures (no real backup), commit min-overkill as the chassis does — keep the surplus on the source.",
  summary: `Hammer's thesis is that under combatModel="lanchester" +
cost = power*dist + 1, max-commit is strictly better per delivered
strength: surplus comes back as raw post-fight strength via
sqrt(W^2 - L^2), and the +1 overhead is paid once regardless of
move size. Hammer applies that universally.

Forge is a more conservative reading. The thesis applies cleanly
when the captured tile actually needs the surplus — i.e., when
there's an adjacent enemy that will fight us back next tick. On
safe captures (kill target has no enemy in its other neighbors,
or only trivially small ones), the surplus on the captured tile
sits idle until it gets absorbed back into reinforcement flow,
and meanwhile the SOURCE tile is starved for next tick. The
chassis's min-overkill (enemy/1.4 + 0.45) is correct in that case.

Rule:
  - Pass 1 picks a kill via the same hemisphere/territory/retake
    logic as the chassis. The picker's "backup" value (max enemy
    strength among the target's other neighbors, capped at 1.5
    via RETAKE_VETO so we never even reach this branch with truly
    contested captures) tells us whether the captured tile faces
    a fight next tick.
  - If backup >= FIGHT_THRESHOLD (0.5), commit attackPower
    (Hammer-style). The captured tile lands with extra raw
    strength to either survive a counter-attack or convert into
    a follow-up kill.
  - If backup < 0.5, commit min-overkill (chassis-style). The
    capture is safe; surplus is better held on the source for
    next-tick options.

Why this is plausibly a strict-upgrade chassis variant rather than
just Hammer-lite:
  - Hammer max-commits universally; on the ~50%+ of kills that
    are safe, that strands strength on a quiet captured tile
    while the source tile loses its action budget next tick.
  - The chassis's RETAKE_VETO (1.5) guarantees that any kill we
    PICK has backup < 1.5 — a narrow band. FIGHT_THRESHOLD = 0.5
    splits that band into "trivial backup, hold reserves" and
    "real backup, dump surplus". The split is roughly where
    Lanchester's preservation actually pays.

Pass 2 (Conqueror.act fallback when no kill but other target) and
Pass 3 (stencil walk) are inherited from Parent unchanged. The
thesis is local to commit sizing on chosen kills.

Tech mirrors the chassis champion {move:76, stack:0, prod:16,
atk:5, def:3} so the commit-sizing delta is isolated.`,
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
    let bestNeeded = 0;
    let bestBackup = 0;
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

        const score = enemy
          + BACKING_WEIGHT * backing
          - RETAKE_W * backup
          + FRIENDLY_W * friend;
        if (score > bestScore) {
          bestScore = score;
          bestNeeded = needed;
          bestBackup = backup;
          bestKill = t;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      // Conditional commit: max-commit only when the captured
      // tile faces a real fight next tick. Otherwise min-overkill
      // to keep surplus on the source.
      const power = bestBackup >= FIGHT_THRESHOLD ? sLimit : bestNeeded;
      army.attack(bestKill, power);
      return;
    }

    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }
    Parent.act(army, game);
  },
};
