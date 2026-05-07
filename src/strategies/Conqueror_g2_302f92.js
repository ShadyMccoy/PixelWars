import Conqueror from "./Conqueror.js";

// Conqueror_g1_879a88 went move-heavy {90,0,2,4,4} and crushed its
// season. But its atk multiplier was 0.952 (atk=4, slope 0.003), so
// the engine's effective attacker bonus was 1.4 * 0.952 = 1.333 -
// noticeably below the BONUS=1.4 hardcoded in Conqueror.act. The
// bot's "minimum overkill" kill-power formula (enemy / BONUS + 0.6)
// was therefore *underestimating* required power; only the +0.6
// margin saved it on small-enemy kills, and it left no slack against
// full-cap defenders.
//
// This descendant trades 10 move -> atk to put atk exactly at
// baseline 20 (mult 1.0), making the engine's effective attacker
// bonus exactly 1.4 - matching the bot's hardcoded constant. The
// kill math is now honest, and the freed knob points feed the
// attack directly. Move stays very high (80, garrison 0.7) so the
// "throw the garrison forward" character that drove g1's +81pp gain
// is mostly preserved (only +0.1 strength left behind per attack).
// Stack/prod/def stay at 0 - the parent's dominant season showed
// they were not the binding constraint on lab1's maxArmy=6 cap.
export default {
  ...Conqueror,
  name: "Conqueror_g2_302f92",
  description: "Conqueror, move 80 / atk 20 - honest 1.4x kill math.",
  summary: `Same Conqueror behavior; tech {move:80, stack:0, prod:0,
atk:20, def:0}. Parent g1 ran move=90/atk=4 which made its atk
multiplier 0.952x and the effective attacker bonus 1.333x - below
the BONUS=1.4 constant the kernel uses to size kill commitments.
Bumping atk to baseline 20 brings the multiplier to exactly 1.0x
so effective bonus = 1.4x, matching the hardcoded constant. Kills
land with honest minimum overkill instead of relying on the +0.6
margin. Move drops only 90 -> 80 (garrison 0.6 -> 0.7), so the
forward-throw character that delivered the parent's +81pp gain is
mostly intact. The matchups most likely to flip are slow
high-strength defenders where the parent's undersized commits could
fall short.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 20, def: 0 },
};
