import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent Conqueror_g1_879a88 = stock Conqueror.act with the GA-discovered
// tech {move:90, stack:0, prod:2, atk:4, def:4}. The tech change alone was
// the biggest gainer in the cross-strategy sweep (5% -> 86% wins).
//
// Residual issue with that combo: stack=0 reduces the per-army cap below
// baseline, and Conqueror.act `continue`s past any friendly neighbor whose
// strength is within 0.5 of its (now-low) cap. Combined with the 4-tile
// alignment loop, mid-match it is common for *all* four directions to be
// blocked — three by maxed friendlies sitting along the front, one by an
// unbeatable enemy — and Conqueror.act returns silently. Those idle ticks
// compound: with prod=2 (low) and growth 1.8, an army that does nothing
// for 2-3 ticks adds little, while a moving army converts strength into
// territory the same tick.
//
// This descendant runs the parent kernel unchanged (preserving the
// alignment thesis) and only kicks in a fallback when the parent did not
// commit. The fallback picks the most-productive single neighbor by
// priority: (1) an empty tile (free expansion), (2) the weakest beatable
// enemy (cheap kill), (3) the friendly with the most room (drain forward
// so a *future* tick can attack from the heavier tile). It is distinct
// from the cousin Conqueror_g6_aa7266 lineage, which does a *strongest*-
// kill prepass and a 5x5 stencil fallback; here the kernel keeps full
// authority over alignment, and we only act when it would have stalled.
//
// Tech is unchanged from the parent — {move:90, stack:0, prod:2, atk:4,
// def:4} is the proven anchor across the Conqueror descendant family
// and this change is purely a kernel-stall hotfix.
export default {
  ...Conqueror,
  name: "Conqueror_g2_cae59e",
  author: "claude",
  version: 1,
  description: "g1_879a88 + idle-tick fallback when the kernel finds no viable direction.",
  summary: `Parent Conqueror_g1_879a88 ports stock Conqueror.act onto
move-heavy tech {90,0,2,4,4}. The kernel's per-direction loop skips
near-cap friendlies and unbeatable enemies, and stack=0 lowers the
friendly cap so that "near-cap" branch fires more often than on
default tech. Result: armies stall silently when all four neighbors
are blocked — alignment-best maxed friendlies plus an unbeatable
enemy on the fourth side.

Loss vs Conqueror_g6_aa7266 in season #40 traces back to that
cousin lineage having an explicit stalemate pass; the parent has
none. This descendant adds the minimum complement: run the parent
kernel first, and only if it did not attack, take a single
adjacency action with priority (empty tile -> weakest beatable
enemy -> friendly with most room). Detection of "did the kernel
fire" uses the strength delta, since army.attack decrements
strength immediately. No tech change.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const before = army.strength;
    Conqueror.act(army, game);
    if (army.strength !== before) return;

    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let emptyTarget = null;
    let weakestEnemy = null;
    let weakestEnemyStrength = Infinity;
    let weakestEnemyNeeded = 0;
    let bestFriendly = null;
    let bestFriendlyRoom = 0;
    let bestFriendlyPower = 0;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!emptyTarget) emptyTarget = t;
        continue;
      }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        if (enemy < weakestEnemyStrength) {
          weakestEnemyStrength = enemy;
          weakestEnemyNeeded = needed;
          weakestEnemy = t;
        }
        continue;
      }
      if (friendlyArmy) {
        const room = friendlyArmy.maxStrength - friendlyArmy.strength;
        if (room <= 0.5) continue;
        const power = Math.min(sLimit, room);
        if (power <= 0.5) continue;
        if (room > bestFriendlyRoom) {
          bestFriendlyRoom = room;
          bestFriendlyPower = power;
          bestFriendly = t;
        }
      }
    }

    if (emptyTarget) { army.attack(emptyTarget, sLimit); return; }
    if (weakestEnemy) { army.attack(weakestEnemy, weakestEnemyNeeded); return; }
    if (bestFriendly) { army.attack(bestFriendly, bestFriendlyPower); return; }
  },
};
