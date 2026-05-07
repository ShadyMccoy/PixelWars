import SlowAndSteady from "./SlowAndSteady.js";

// Parent Phalanx lost both recorded matches to Conqueror descendants
// running the GA-optimum {move:90, stack:0, prod:2, atk:4, def:4}
// tech. Phalanx's own tech ({stack:50, def:50}) is the worst-of-both
// case for a cohesion bot: move=0 forces a 1.5 garrison floor so even
// when the bot does engage, attackPower is hobbled; prod=0 puts growth
// below baseline so the sit-and-grow thesis is *slower* than neutral;
// atk=0 weakens every committed strike. The cohesion logic is fine —
// the loadout is what's killing it.
//
// Two changes, both targeting weaknesses the parent's own summary
// names:
//
// 1) Swap to the proven Conqueror tech. The cohesion check still
//    decides *which* armies act, so the "stay grouped" thesis is
//    preserved. We just give every action that does fire a much
//    better hit profile (0.6 garrison, 1.04x attack, slightly slower
//    growth offset by a smaller cap that fills sooner).
//
// 2) Orphan-rescue clause. The parent summary explicitly flags this:
//    "if we get separated early the orphans never rejoin and just sit
//    there making strength forever." With the new tech the cap fills
//    faster, making orphan stalls more wasteful. Fix: if friendlies
//    == 0 but the army is at near-max strength, growth is already
//    being thrown away — at that point any move dominates standing
//    still, so fall through to SlowAndSteady and try to reconnect.
//    Armies still growing keep the cohesion guard.
export default {
  name: "Phalanx_g1_5b920f",
  author: "claude",
  version: 1,
  description: "Phalanx with the proven Conqueror tech and an orphan-rescue clause for capped isolated armies.",
  summary: `Cohesion-first like the parent: an army with at least one
friendly neighbor plays SlowAndSteady, an isolated army normally sits
and grows. Two targeted fixes:

The parent's tech ({stack:50, def:50}) leaves move/prod/atk all at 0,
which is below baseline — every engagement commits less strength than
neutral and growth is slower than neutral too. Swapping to the proven
Conqueror loadout {move:90, stack:0, prod:2, atk:4, def:4} keeps the
cohesion filter making the same decisions but gives each fired action
a 0.6 garrison floor (vs 1.5) and a 1.04x attack multiplier. The
smaller stack cap is fine for a sit-and-grow bot because growth is
already capped against any stack — what matters is that the cap is
reached sooner so committable strength accumulates faster.

The orphan-rescue clause addresses the failure mode the parent's
summary explicitly names. Isolated armies at near-max strength are
strictly losing — growth is throwing away strength against the cap
and the cohesion guard keeps them frozen forever. The new clause lets
those capped orphans run SlowAndSteady to attempt reconnect; armies
still below cap keep the original guard, so the cohesion thesis still
shapes the early-game spread.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    const pid = army.player.id;
    let friendlies = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id === pid) {
          friendlies++;
          break;
        }
      }
    }
    if (friendlies === 0) {
      // Orphan-rescue: only stay still if growth is still helping.
      // At cap, growth is wasted, so any move dominates sitting.
      if (army.strength < army.maxStrength - 0.5) return;
    }
    SlowAndSteady.act(army, game);
  },
};
