import Conqueror from "./Conqueror.js";

// Rebalances the parent's extreme-move loadout to shore up its
// weakest dimension: defense.
//
// Parent { move:90, stack:0, prod:2, atk:4, def:4 } yields:
//   garrison 0.60, stack 0.984x, prod 0.986x, atk 0.952x, def 0.872x
// def at 0.872x means parent takes ~15% more incoming damage than a
// neutral bot - the steepest tax in its loadout, since def has the
// largest slope (0.008 vs atk 0.003, stack/prod 0.0008).
//
// This descendant trades 10 points of move (0.6 -> 0.7 garrison, a
// minor giveback) and the negligible prod/atk crumbs for +12 def:
//   { move:80, stack:0, prod:0, atk:4, def:16 }
//   -> garrison 0.70, atk 0.952x (same), def 0.968x (+11% durability)
// The garrison floor stays well below the 1.3 baseline so the
// "minimum-overkill kills with full transfer" character is intact;
// the defender no longer crumples on the counter-attack.
export default {
  ...Conqueror,
  name: "Conqueror_g2_e90f66",
  description: "Conqueror move-heavy with def restored toward baseline (80/0/0/4/16).",
  summary: `Descendant of Conqueror_g1_879a88. Parent's tech maxes
move at the cost of every other knob, leaving def at 0.872x - a
real liability since def has the steepest tech slope. Shifting 10
points from move and the leftover prod/atk crumbs into def (final
{move:80, stack:0, prod:0, atk:4, def:16}) raises the def
multiplier to 0.968x (+11% durability) while only nudging the
garrison floor from 0.60 to 0.70. The aggressive forward-throw
character that drove the parent's GA win is preserved; the
brittleness on incoming hits is reduced.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 4, def: 16 },
};
