import parent from "./Conqueror_g19_9533e3.js";

// Hypothesis (one knob): shift one tech point prod -> def. New tech:
// {move:76, stack:0, prod:15, atk:4, def:5}.
//
// Why:
//   - In season #136 the parent g19_9533e3 (move:76, prod:16) lost
//     all five tracked seeds. Placements: #3, #5, #2, #5, #2. The
//     #5 finishes are the loud signal: both came against atk-amped
//     attackers - g6_53407c (atk:5/def:3, seed=211) and the
//     move:90/prod:2 factory g8_3280dd (seed=194). The other
//     move:90-cluster winners (g6_27c4e7 on seed=233, g5_f15d3e on
//     seed=186) produced #3 and #2 - bad but survivable. The
//     truly punishing losses were specifically against atk-amped
//     opponents.
//   - The parent's strong claim was that the move->prod gradient
//     had not plateaued. Season #136 refutes that claim:
//     overshooting to prod:16 produced no win and the worst
//     placements the lineage has seen. So the parent's bet (prod
//     gradient continues paying out) is the wrong direction to
//     keep pushing. We need to retreat at least one step on prod.
//   - Where to put the freed point? The loss data is unusually
//     specific: the two worst placements were against atk-amped
//     attackers. One point of def lifts the def multiplier and
//     directly raises survival margin against exactly that
//     opponent class. The parent's commentary called asymmetric
//     splits "underperforming" based on g15 (5/3) and g17 (4/6),
//     but those were earlier seasons. In the current #136 meta a
//     5/3 atk-amped winner (g6_53407c) literally beat the parent
//     to a #5 finish - direct evidence that asymmetric splits are
//     paying out NOW. A symmetric 4/4 chassis is being
//     out-asymmetric-ed; pushing def:5 is a measured probe of the
//     opposite asymmetric direction in the same season's meta.
//   - Why prod -> def specifically (not move -> def)? prod:16 is
//     the parent's failed bet that needs to retreat first. move:76
//     is the parent's other change but the lineage commentary has
//     consistently argued (since g16) that move:76 saturates the
//     lab1 garrison floor; we have no fresh contradicting evidence
//     for move, only for prod. Touching the knob with refuted
//     evidence is the targeted move.
//   - Why def:5 and not def:6 (i.e. why one point not two)? Two
//     points is the magnitude g17 and g18 swung; the parent's own
//     commentary explicitly called out g17's 4/6 as
//     "underperforming". One point is half the magnitude of that
//     prior failed bet, keeps the chassis closer to the symmetric
//     baseline that g13/g16 won with, and is recoverable in one
//     descendant if the season says def is wrong here.
//
// Failure mode: if the parent's prior claim that asymmetric splits
// underperform on this chassis still holds in the current meta,
// def:5 costs us a fraction of prod output (15/16 = ~94% of the
// failed bet's prod axis) for a defense bump that doesn't actually
// trip in the seeds we play. Bounded downside: 1 point moved, half
// the magnitude of the parent's bet and of the prior failed
// asymmetric experiments, destination one tick into asymmetric
// space. If the season's #5 placements were really about atk-amped
// opponents (which the loss data suggests), def:5 should specifically
// pull those #5s up toward middle-of-pack.
//
// Strategy code is byte-identical to parent g19 (which inherits
// from g18 -> g17 -> g16 -> g15 -> g14 via spread). Only the tech
// field is overridden.
export default {
  ...parent,
  name: "Conqueror_g20_19eb85",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g19_9533e3 with one tech point shifted prod -> def: {move:76, stack:0, prod:15, atk:4, def:5}. Retreats from the refuted prod:16 bet and probes asymmetric def in response to atk-amped opponents.",
  summary: `Parent Conqueror_g19_9533e3 (move:76, prod:16, atk:4,
def:4) lost season #136 across all five tracked seeds with
placements #3, #5, #2, #5, #2. The parent's hypothesis was that the
move->prod gradient had not plateaued; the season refutes that -
overshooting to prod:16 produced no win and the worst placements
the lineage has seen.

The loss data is unusually specific about the failure mode: the two
#5 finishes both came against atk-amped attackers - g6_53407c at
atk:5/def:3 (seed=211) and the move:90/prod:2 factory g8_3280dd
(seed=194). The other move:90-cluster losses produced milder
placements (#3 vs g6_27c4e7, #2 vs g5_f15d3e). The chassis is most
fragile to opponents that amplify their kill output.

This descendant retreats from prod:16 by exactly one point and
parks that point in def, taking the tech from {76,0,16,4,4} to
{76,0,15,4,5}. One point is half the magnitude the parent and g17
swung (g17 went 4/6, which the parent's own commentary called
underperforming). The bet is more conservative: pull back the
refuted-by-data prod axis a single notch, place the freed point
where the season's loss vector points - directly at survival
against atk-amped attackers.

Specifically NOT retreating to g16's exact tech (78,0,14,4,4)
because that probes nothing new about asymmetric def, the axis the
loss data actually flagged. Specifically NOT swinging def by 2
because that repeats g17's prior failed asymmetric bet at the same
magnitude. One point is the smallest move that can register against
the asymmetry already winning in the current meta.

Failure mode: if asymmetric splits still underperform on this
chassis in the current meta, def:5 costs ~6% of the failed prod bet
in exchange for a defense bump that doesn't fire in the seeds we
play. Bounded downside: 1 point moved, half the magnitude of prior
failed bets, destination one tick into asymmetric space.

Strategy code is byte-identical to parent g19 (inherited via
spread). Only the tech field changes.`,
  tech: { move: 76, stack: 0, prod: 15, atk: 4, def: 5 },
};
