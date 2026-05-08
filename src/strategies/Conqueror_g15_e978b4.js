import parent from "./Conqueror_g14_7d3830.js";

// Hypothesis (one knob): shift one tech point def -> atk on top of
// the parent's existing strategy. Take
//   {move:80, stack:0, prod:12, atk:4, def:4}
// to
//   {move:80, stack:0, prod:12, atk:5, def:3}.
//
// Why this should help against the recorded losers:
//   - The parent's strategy is unambiguously offense-first: every
//     branch (Pass 1 retake-aware kill, Pass 2 Conqueror.act for
//     grabs/topups, Pass 3 stencil-routed kill, Pass 4 no-margin
//     safety net) tries to flip an enemy tile before it tries
//     anything else. atk multiplies the output side of every one of
//     those decisions; def only matters on turns where an enemy
//     reaches us *without* being killed first, which the chassis
//     actively avoids.
//   - The exact same one-point def->atk swap is what
//     Conqueror_g6_53407c (which beat the parent at season #129
//     seed=237) used to dominate season #119. Same chassis family,
//     different strategy code, but the offense lever was the
//     decisive change.
//   - tryNoMarginKill (Pass 4) is gated by
//        killCeiling = sLimit * BONUS * atkMult / maxDef
//     so atk:5 vs typical opponents' def:4 raises atkMult and
//     widens the killCeiling directly. That is the strict
//     resolution the parent designed in but isn't fully exploiting
//     because its atk and def are symmetric. Same widening applies
//     to Pass 3's `enemy / BONUS > sLimit + 0.5` viability check
//     because sLimit itself grows with atkMult.
//   - prod:12 is preserved because g10_cbab8a's tech win was
//     validated independently and we don't want to confound this
//     test with a production swing. move:80 (the prod:12 trade) is
//     also preserved for the same reason. stack:0 is settled.
//
// Failure mode if wrong: in mirror match-ups against the cousin
// lineage at atk:4/def:4, our def:3 vs their atk:4 widens THEIR
// kill ceiling against us by the same proportion. But Pass 1's
// kill-first priority means we usually flip *their* tile before
// they flip ours, and the retake-aware veto (RETAKE_VETO=1.5)
// already filters captures whose backup would retake at minimum
// cost. So the asymmetry should still net positive on average.
//
// Strategy code byte-identical to parent via spread. Only the
// `tech` field is overridden.
export default {
  ...parent,
  name: "Conqueror_g15_e978b4",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_7d3830 with one tech point shifted def->atk to amplify the chassis's offense-first decision tree.",
  summary: `Strategy code is byte-identical to parent
Conqueror_g14_7d3830 (Pass 1 retake-aware hemisphere/backing/friendly
score with RETAKE_VETO=1.5 and MARGIN=0.45, Pass 2 Conqueror.act for
empty grabs and friendly top-ups, Pass 3 multi-candidate stencil5
walk with honest path-clear semantics, Pass 4 tryNoMarginKill safety
net using the strict engine resolution sLimit * BONUS * atkMult >
enemy * defMult).

The single change is one point of tech, def -> atk:
  parent: {move:80, stack:0, prod:12, atk:4, def:4}
  this:   {move:80, stack:0, prod:12, atk:5, def:3}

Rationale: every decision branch in the chassis is offense-first
(beatable kill, then grab/balance, then route toward beatable
enemy, then strict-engine no-margin kill). atk multiplies the
output side of all four. The Pass 4 killCeiling
(sLimit*BONUS*atkMult/maxDef) widens directly with atkMult, so
borderline-too-strong adjacent enemies that the parent's atk:4
just missed flip one turn earlier with atk:5 - exactly the band
the safety net was designed to catch.

Conqueror_g6_53407c (which beat the parent at season #129 seed=237)
made the same one-point def->atk swap on top of g5_f15d3e and that
was the decisive change in its lineage. The parent's strategy is
even more offense-leaning than g5_f15d3e, so the lever should pay
off at least as well here.

prod:12 and move:80 are preserved because g10_cbab8a's tech win was
validated independently of strategy and we don't want to confound
this small test with a production swing. The change is strategy-
neutral and additive on the offense axis.`,
  tech: { move: 80, stack: 0, prod: 12, atk: 5, def: 3 },
};
