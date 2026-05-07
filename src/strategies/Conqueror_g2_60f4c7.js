import Conqueror from "./Conqueror.js";

// Parent (Conqueror_g1_879a88) ran {move:90, stack:0, prod:2, atk:4,
// def:4} and dominated season 32. Its weakest knob is def=4 — with
// def's 0.008 slope, that's a 0.872x defensive multiplier, so every
// incoming clash lands ~13% harder than baseline. Nothing in S32
// punished it, but def is the highest-slope non-move knob and a
// likely target for counter-bots in future seasons.
//
// Shift 10 move + 2 prod -> 12 def. The trade math:
//   - move 90 -> 80 raises the garrison floor from 0.6 to 0.7. At a
//     typical strength of 5 that's 4.3 vs 4.4 attackable (~2% less
//     forward force per tick), and the +0.6 margin in Conqueror's
//     `enemy/BONUS + 0.6` kill-sizing easily absorbs it.
//   - def 4 -> 16 lifts the defense multiplier from 0.872 to 0.968,
//     a +11% resilience gain that compounds over the alignment
//     wall's many edge clashes.
//   - prod 2 -> 0 shaves 0.13% off regrowth (slope 0.0008) — noise.
//
// Net: trade ~2% offense for ~11% defense, plugging the parent's
// only meaningfully sub-baseline knob without abandoning the
// "extreme move" thesis that drove +81 pp in the GA sweep.
export default {
  ...Conqueror,
  name: "Conqueror_g2_60f4c7",
  description: "Conqueror move-heavy with def floor (80/0/0/4/16).",
  summary: `Inherits Conqueror_g1_879a88's extreme-move insight but
plugs its weakest knob. Parent had def=4 (0.872x defensive mult);
this descendant lifts def to 16 (0.968x, near baseline) by trimming
move 90->80 (garrison 0.6->0.7) and prod 2->0. Move's marginal
return is small at this end of the curve, while def has the highest
slope of the non-move knobs; the trade ought to net positive against
any counter-bot with above-baseline atk. Conqueror's hardcoded
BONUS=1.4 in the kill-sizing formula assumes ~1.0x atk/def mults, so
moving def from a deep penalty toward baseline also makes its
incoming-clash math more accurate, not just stronger.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 4, def: 16 },
};
