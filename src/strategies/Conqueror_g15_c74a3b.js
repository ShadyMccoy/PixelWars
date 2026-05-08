import parent from "./Conqueror_g14_7d3830.js";

// Hypothesis (one knob): shift 10 tech points prod -> move, taking
// {move:80, stack:0, prod:12, atk:4, def:4}
//   ->
// {move:90, stack:0, prod:2,  atk:4, def:4}.
//
// Why this should help:
//   - Every season-#129 bot that beat the parent and has on-disk
//     source (g6_53407c, g12_f23241, g6_b70bfa) runs move:90 / prod
//     low. The parent's move:80/prod:12 came from g10_cbab8a, which
//     the parent's own header notes "was validated independently of
//     strategy" - a passive-growth tech grafted onto a chassis that
//     has since become unambiguously kill-first (Pass 1 hemisphere
//     score, Pass 3 multi-candidate stencil walk, Pass 4
//     tryNoMarginKill). Strategy and tech are out of sync.
//   - move governs the garrison floor and therefore army.attackPower
//     (sLimit). Every commit gate in this chassis is sLimit-bound:
//       - tryCommit: needed = enemy/BONUS + MARGIN <= sLimit
//       - Pass 3 isPassable + candidate filter: enemy/BONUS <= sLimit
//       - tryNoMarginKill: killCeiling = sLimit*BONUS*atkMult/maxDef
//     Raising move pushes sLimit up turn-after-turn. Even modest
//     bumps move borderline enemies from "too strong" to "killable",
//     which is exactly the band tryNoMarginKill was added to catch
//     and exactly the band the season-#129 winners exploit one tick
//     earlier than us.
//   - The trade-off is prod (passive territory output multiplier)
//     vs move (per-turn kill bandwidth). On lab1 (30x22, growth
//     1.8, maxArmy 12, wrap), maxArmy is small and growth is high,
//     so production saturates quickly anyway; the marginal value of
//     prod above ~2 is low. Move, in contrast, has no saturation
//     point - more attackPower is always at least as good for an
//     offense-first chassis.
//   - Risk: less prod means slower army-count regrowth after a bad
//     trade. Mitigated because the chassis (Pass 1 RETAKE_VETO=1.5,
//     retake-aware scoring, hemisphere backing term) actively avoids
//     the bad-trade scenarios where prod would matter; and lab1's
//     1.8 growth keeps territory output strong even at prod:2.
//
// Strategy code is byte-identical to parent g14_7d3830 by spread
// import. This isolates the tech change as the only variable; if
// the season measurably moves, it is the tech.
export default {
  ...parent,
  name: "Conqueror_g15_c74a3b",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_7d3830 with 10 tech points shifted prod->move to align tech with the chassis's kill-first character.",
  summary: `Strategy code is identical to parent Conqueror_g14_7d3830
(retake-aware Pass 1, Conqueror.act Pass 2, multi-candidate Pass 3
stencil walk, engine-strict tryNoMarginKill Pass 4). The change is
one tech reallocation:

  parent:     {move:80, stack:0, prod:12, atk:4, def:4}
  descendant: {move:90, stack:0, prod:2,  atk:4, def:4}

Rationale: every season-#129 winner with on-disk source - g6_53407c,
g12_f23241, g6_b70bfa - runs move:90 / prod-low. The parent's
move:80/prod:12 was inherited from g10_cbab8a, whose own header
called the change "validated independently of strategy", i.e. a
passive-growth knob grafted onto a chassis that has since become
unambiguously kill-first.

Every commit gate in this chassis is sLimit-bound (tryCommit,
isPassable, killCeiling), and sLimit is governed by move via the
garrison floor. Raising move pushes borderline-too-strong enemies
into the band Pass 1 / Pass 4 already scan for, one tick earlier
- exactly the tempo edge the winners exploit over us. On lab1
(maxArmy 12, growth 1.8) prod saturates quickly so the value of
prod above ~2 is low; move has no saturation for an offense-first
chassis.

This is the move:90 standard the lineage's winners have already
converged on. Tech total stays at 100 (10 shifted from prod to
move). Strategy code spread-imported byte-identical from parent so
the season measures only the tech delta.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
};
