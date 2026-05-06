// Parametric Pinwheel. Pinwheel sweeps a fixed cardinal sequence
// (W -> N -> E -> S) with each direction held for a fixed number of
// ticks. This template exposes the rotation sequence, per-phase
// duration, and the kill-priority knob (whether to interrupt the
// sweep for a winnable adjacent enemy).
//
// makePinwheelVariant({rotation, phaseTicks, killPriority,
//                      attackerBonus, name}) -> strategy.

import { balanceAttack } from "../helpers.js";

export const PINWHEEL_DEFAULTS = Object.freeze({
  // Rotation order through W=0, N=2, E=1, S=3. Stored as a
  // permutation of [0,1,2,3].
  rotation: Object.freeze([0, 2, 1, 3]),
  // How many ticks each phase holds. Per-direction.
  phaseTicks: Object.freeze([4, 4, 4, 4]),
  // 0 = original Pinwheel (commit phase direction first, fall through
  // to weakestAdjacent). 1 = take adjacent kills first (Crusader-
  // style), then phase commit.
  killPriority: 0,
  // Used only when killPriority == 1: minimum margin for kill.
  attackerBonus: 1.4,
});

export const PINWHEEL_SCHEMA = Object.freeze({
  // Rotation: 4-cell array of integers 0..3. Note: random init may
  // produce duplicates (e.g. [0,0,2,1]); the bot tolerates that — it
  // just means some directions are skipped while others are revisited.
  rotation:      { length: 4, min: 0, max: 3, sigma: 1, int: true },
  phaseTicks:    { length: 4, min: 1, max: 12, sigma: 1, int: true },
  killPriority:  { min: 0, max: 1, sigma: 0.5, int: true },
  attackerBonus: { min: 1.0, max: 1.7, sigma: 0.04 },
});

export function makePinwheelVariant(params = {}) {
  const p = { ...PINWHEEL_DEFAULTS, ...params };
  const name = params.name ?? "ParamPinwheel";
  const ROT = p.rotation;
  const PHASES = p.phaseTicks;
  const KILL_FIRST = p.killPriority === 1;
  const ATTACKER_BONUS = p.attackerBonus;
  const CYCLE_LEN = PHASES.reduce((a, b) => a + b, 0) || 1;
  const CUM_ENDS = (() => {
    const out = [];
    let s = 0;
    for (const t of PHASES) { s += t; out.push(s); }
    return out;
  })();

  function phaseFor(tick) {
    const t = ((tick % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
    for (let i = 0; i < CUM_ENDS.length; i++) {
      if (t < CUM_ENDS[i]) return i;
    }
    return CUM_ENDS.length - 1;
  }

  return {
    name,
    author: "ga",
    version: 1,
    description: `Parametric Pinwheel (rot=[${ROT.join(",")}], phases=[${PHASES.join(",")}], killFirst=${KILL_FIRST}, ab=${ATTACKER_BONUS.toFixed(2)})`,
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const sLimit = army.attackPower;
      if (sLimit <= 0.5) return;

      const neighbors = tile.neighbors;
      const pid = army.player.id;

      // Optional kill-first scan.
      if (KILL_FIRST) {
        const myEff = sLimit * ATTACKER_BONUS;
        let bestKill = null;
        let bestEnemyStr = -1;
        for (let i = 0; i < 4; i++) {
          const t = neighbors[i];
          if (!t) continue;
          const armies = t.armies;
          let enemy = 0;
          let friendly = false;
          for (let k = 0; k < armies.length; k++) {
            const a = armies[k];
            if (a.player.id === pid) { friendly = true; break; }
            enemy += a.strength;
          }
          if (friendly || enemy <= 0) continue;
          if (myEff <= enemy) continue;
          if (enemy > bestEnemyStr) { bestEnemyStr = enemy; bestKill = t; }
        }
        if (bestKill) {
          army.attack(bestKill, sLimit);
          return;
        }
      }

      const dir = ROT[phaseFor(game.tick)];
      const target = neighbors[dir];

      if (target) {
        const armies = target.armies;
        let friendlyArmy = null;
        let enemy = 0;
        for (let k = 0; k < armies.length; k++) {
          const a = armies[k];
          if (a.player.id === pid) friendlyArmy = a;
          else enemy += a.strength;
        }
        if (friendlyArmy) {
          if (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
            const room = friendlyArmy.maxStrength - friendlyArmy.strength;
            army.attack(target, Math.min(sLimit, room));
            return;
          }
        } else if (enemy <= 0) {
          army.attack(target, sLimit);
          return;
        } else if (enemy + 1 < army.strength) {
          army.attack(target, sLimit);
          return;
        }
      }

      const fallback = army.weakestAdjacent();
      if (fallback) balanceAttack(army, fallback);
    },
  };
}
