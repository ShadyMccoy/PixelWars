import { balanceAttack } from "./helpers.js";

const ATTACKER_BONUS = 1.4;
const ROT = [0, 2, 1, 3];
const PHASE_TICKS = 4;

// Pinwheel-Kill hybrid. Standard Pinwheel commits the phase
// direction first; if blocked, falls through to weakestAdjacent.
// This variant inverts: every tick, first scan all four neighbors
// for a winnable adjacent enemy (factoring 1.4x attacker bonus); if
// one exists, kill it. Otherwise do the phase-direction sweep. The
// thesis: free kills should never be skipped just because the
// rotation cadence says "go north this tick" - take the kill,
// resync next tick.
export default {
  name: "Pinwheel_g1_0ca9c3",
  author: "claude",
  version: 1,
  description: "Pinwheel that interrupts its sweep to take any winnable adjacent kill.",
  summary: `Pinwheel base, but the kill-check from Crusader runs
before the phase-direction commit. If a winnable adjacent enemy
exists, attack it (strongest such target, like Crusader). Otherwise
play normal Pinwheel. Sacrifices a bit of synchrony for opportunistic
kills - the engine's 1.4x attacker bonus makes free kills high-EV.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = sLimit * ATTACKER_BONUS;

    // 1) Crusader-style adjacent kill check.
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

    // 2) Standard Pinwheel phase commit.
    const dir = ROT[Math.floor(game.tick / PHASE_TICKS) % 4];
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
