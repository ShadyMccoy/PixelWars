import Membrane from "./Membrane.js";

// Parent Membrane_g1_b9f1d5 ran the GA-discovered extreme-move loadout
// (move:90, stack:0, prod:2, atk:4, def:4). It dominated calibration
// against the elite top-10 pool but lost twice in season #26:
//   1. Crusader_g1_352d0a (max-ticks #3/6 finish - couldn't break out)
//   2. Conqueror_g4_b6afb7 (#2/6, lost in 312 ticks - got snowballed)
//
// The Conqueror_g4_b6afb7 winner had itself shifted 10 points from
// move (90 -> 80) into atk (4 -> 14) for a documented reason: at
// atk=4 the per-fight multiplier is 0.952x, below baseline, and
// near-parity seams stalled because needed-strength just exceeded
// sLimit. The same lever applies to Membrane, and harder than the
// gate suggests, because Membrane's pickEnemyToAttack uses the
// engine's raw 1.4 attackerBonus and IGNORES tech.atk entirely:
//
//   pickEnemyToAttack: myStrength >= 1 + enemySum / bonus
//
// At parent atk=4 (mult 0.952) attacking a max-strength=6 defender
// with self at strength=6: gate passes (6 >= 5.29), but the actual
// effective combat is 5.4 * 1.4 * 0.952 = 7.20 vs 6 = margin 1.20,
// leaving only 1.20 / (1.4 * 0.952) ~ 0.90 strength on the captured
// tile. Thin survival means an immediate counter-attack wipes the
// breach. At atk=14 (mult 0.982) the same fight: 5.3 * 1.4 * 0.982
// = 7.29 vs 6 = margin 1.29, captured tile holds ~0.94 strength -
// small but nonzero headroom against the seam-deadlock the parent
// hit against Crusader's max-ticks defense.
//
// Trade move 90 -> 80 (garrison 0.6 -> 0.7, a 0.1-strength tax per
// push; at maxArmy=6 the bot still throws 5.3 strength forward at
// full army - extremely aggressive). atk 4 -> 14 (mult 0.952 ->
// 0.982). prod, stack, def unchanged.
//
// This is the same loadout shift that took Conqueror_g3 ->
// Conqueror_g4_b6afb7. Behavior is byte-identical to the parent;
// only the tech vector changes.
export default {
  ...Membrane,
  name: "Membrane_g2_d8fdcf",
  description: "Membrane with move 80 / atk 14 - mirrors the Conqueror_g4 tech shift that beat the parent.",
  summary: `Tech-only descendant of Membrane_g1_b9f1d5. The parent
ran extreme move (90/0/2/4/4) and lost to two opponents last
season, including Conqueror_g4_b6afb7 which had itself moved 10
tech points from move into atk for documented seam-breaking
reasons. We apply the same shift to Membrane.

Membrane combat is doubly hurt by low atk because Membrane.js's
pickEnemyToAttack predates the tech system - it gates on
S >= 1 + D/bonus using only the raw 1.4 attackerBonus, with no
atk-multiplier correction. So at atk=4 (mult 0.952) we under-fight
relative to what the gate believes, leaving captured tiles thin
(~0.9 strength after a max-vs-max breach) and vulnerable to
counter-strike. At atk=14 (mult 0.982) the captured tile holds a
sliver more strength on the same fight - not much, but enough to
matter at the parity seams that gave us the max-ticks loss to
Crusader.

Move 90 -> 80 costs 0.1 strength per push (garrison floor 0.6 ->
0.7), still well below baseline (1.3) and still allows 5.3 strength
forward at max army. The cytoplasm pump mechanism is unchanged.
Stack:0, prod:2, def:4 are inherited from the parent.`,
  tech: { move: 80, stack: 0, prod: 2, atk: 14, def: 4 },
};
