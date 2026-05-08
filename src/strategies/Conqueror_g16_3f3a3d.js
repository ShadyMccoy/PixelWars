import parent from "./Conqueror_g15_e978b4.js";

// Hypothesis (one knob): shift 4 tech points from prod to move on
// top of the parent. Keep the parent's atk:5/def:3 offense lever
// untouched.
//
//   parent: {move:80, stack:0, prod:12, atk:5, def:3}
//   this:   {move:84, stack:0, prod:8,  atk:5, def:3}
//
// Why this should help against the recorded losers:
//   - All three bots that beat the parent in season #130 run
//     {move:90, stack:0, prod:2, atk:4, def:4}: g9_d2499d,
//     g9_5c4555, g12_f23241. Move-heavy, prod-light, def:4. The
//     parent's strategy code is byte-identical to g14 and its
//     MARGIN/RETAKE_VETO knobs are already tuned identically to
//     those winners. The only remaining structural difference is
//     tech allocation, and it's tilted in exactly the wrong
//     direction (move:80/prod:12 vs winners' move:90/prod:2).
//   - The instructions explicitly flag tech as the
//     under-explored axis in this lineage. Past descendants
//     re-tune strategy with the same tech, leaving 10-15% on
//     the table when the strategy doesn't match the allocation.
//     The parent's chassis is offense-first AND highly mobile
//     (Pass 1 picks targets across the 5x5 stencil; Pass 3
//     routes to non-adjacent enemies). Both passes pay off
//     more per turn when garrison floors (move) are higher,
//     because more strength is available to commit on each
//     decision. prod buys raw output rate, but on a 30x22 map
//     with growth 1.8 the bottleneck for an offense-first bot
//     is *getting strength to the right tile*, not making more
//     of it - exactly what move tech buys.
//   - I keep the atk:5/def:3 lever the parent installed because
//     the same logic from the parent's hypothesis still holds:
//     atk multiplies the output side of every offensive branch
//     and widens the Pass 4 killCeiling. The parent didn't have
//     enough seasons to confirm or refute that lever yet. By
//     not touching it I avoid confounding this test with a
//     reversal of the parent's swap.
//   - I shift 4 points (not the full 10 that would match the
//     winners exactly) because:
//       a) That preserves the spirit of "one small targeted
//          change" rather than wholesale swapping to a known
//          configuration. The point is to test the *direction*,
//          not to clone a winner.
//       b) Going all the way to prod:2 also drops production
//          into the floor where g10_cbab8a's prod:12 win was
//          measured. A 4-point step keeps prod still
//          contributing meaningfully (8 is comfortably above
//          the prod:2 floor) while testing whether moving the
//          balance toward move helps. If the season shows a
//          rating bump, future descendants can keep walking
//          toward {move:90, prod:2}; if it shows a regression,
//          the parent's tech and the cousin lineage's tech
//          aren't as commensurable as the head-to-head data
//          suggests and we know to look elsewhere.
//       c) prod is non-linear in some regimes (early growth
//          compounding); shrinking it from 12 to 8 instead of
//          12 to 2 also keeps the change closer to a local
//          search than a teleport.
//
// Failure mode if wrong: with prod:8 we make less strength per
// turn than the parent did, so against a peer with prod:12 we
// generate marginally less army even as we move it better. If
// the maps and seedings on lab1 reward late-game raw production
// over mid-game positioning, this loses on the prod axis without
// gaining enough on move to compensate. Recovery is straightforward:
// the next descendant reverts the prod hit while keeping any move
// gain (or reverts entirely) once the season says so.
//
// Strategy code byte-identical to parent via spread. Only the
// `tech` field is overridden.
export default {
  ...parent,
  name: "Conqueror_g16_3f3a3d",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g15_e978b4 with 4 tech points shifted prod->move to match the move-heavy allocation of every recent head-to-head winner.",
  summary: `Strategy code is byte-identical to parent
Conqueror_g15_e978b4 (which is byte-identical to g14_7d3830:
Pass 1 retake-aware hemisphere/backing/friendly score with
RETAKE_VETO=1.5 and MARGIN=0.45, Pass 2 Conqueror.act for empty
grabs and friendly top-ups, Pass 3 multi-candidate stencil5 walk
with honest path-clear semantics, Pass 4 tryNoMarginKill safety
net using the strict engine resolution sLimit*BONUS*atkMult >
enemy*defMult).

The single change is 4 tech points shifted prod -> move:
  parent: {move:80, stack:0, prod:12, atk:5, def:3}
  this:   {move:84, stack:0, prod:8,  atk:5, def:3}

Rationale: all three bots that beat the parent in season #130
(g9_d2499d, g9_5c4555, g12_f23241) run move:90/prod:2. The
parent's MARGIN/RETAKE_VETO/atk_swap are already tuned in line
with those winners; the only remaining structural difference is
tech allocation, and the parent's is tilted away from the proven
winning direction. The chassis is offense-first AND highly
mobile - Pass 1 picks across a 5x5 stencil, Pass 3 routes
multi-step toward non-adjacent enemies - both of which pay off
more per turn when garrison floors are higher. On a 30x22 lab1
map with growth 1.8 the bottleneck for offense-first play is
positioning strength, not generating more of it.

The atk:5/def:3 lever the parent installed is preserved because
the same offense-amplification argument the parent made still
holds; the parent didn't get enough seasons to confirm or refute
it, and reverting it would confound this tech-direction test.

The shift is 4 points rather than 10 (which would match the
winners exactly): the goal is to test the *direction* of the
move-heavy thesis with a local-search step, not teleport into a
known cousin's allocation. prod:8 is still well above the
prod:2 floor where the cousin lineage runs and stays inside the
band where g10_cbab8a's prod tech win was measured.`,
  tech: { move: 84, stack: 0, prod: 8, atk: 5, def: 3 },
};
