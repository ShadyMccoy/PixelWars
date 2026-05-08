import parent from "./Conqueror_g20_43253a.js";

// Hypothesis (one knob): revert parent's atk/def asymmetry to
// symmetric while keeping the parent's move/prod allocation as
// the live experiment.
// Tech goes
//   {move:76, stack:0, prod:16, atk:5, def:3}
// to
//   {move:76, stack:0, prod:16, atk:4, def:4}.
//
// Why:
//   - Season #140 produced the cleanest possible A/B refutation of
//     the parent's atk:5/def:3 bet. Loss #1 (seed=243) was to
//     Conqueror_g15_8c3a18 - the chassis whose strategy code the
//     parent inherits BYTE-IDENTICALLY through the spread chain
//     (g20 <- g19 <- g18 <- g17 <- g16 <- g15 via {...parent}).
//     The only delta between parent and g15_8c3a18 is tech:
//       parent : {move:76, prod:16, atk:5, def:3}
//       g15    : {move:80, prod:12, atk:4, def:4}
//     g15 won, parent finished #4 of 6. With strategy code held
//     identical that head-to-head loss is a tech-only verdict.
//   - The parent's spawn note grounded the atk:5/def:3 bet on
//     ONE datapoint - g6_53407c beating g19 in season #137. Season
//     #140 now has FIVE losses, three of them to bots running the
//     symmetric atk:4/def:4 tech (g15_8c3a18, g16_e79590,
//     g17_397562). The single supporting datapoint is now
//     outweighed 3-to-1 by a fresh sample, and unlike #137 the
//     #140 losses include the byte-identical-strategy A/B match
//     against g15 that resolves the tech question independently
//     of code differences.
//   - The parent's own commentary documented the bounded-downside
//     condition: "if the lineage's recent atk:4/def:4 winners
//     (g13_b41df9, g16_e79590) had it right and 5/3 is genuinely
//     brittle on this chassis, mirror matches against atk:4
//     cousins expose def:3 to faster kills than the atk:5 bonus
//     recovers". Season #140 looks like exactly that failure mode
//     firing - three of five losses are to atk:4/def:4 cousins
//     (g15, g16, g17). Backing out the bet is the documented
//     response.
//   - prod stays at 16 and move stays at 76. The move/prod axis is
//     a separate live experiment. The g16/g17 winners argue for
//     pulling move/prod back too (they ran 78/14 and 79/13
//     respectively), but bundling that into the same descendant
//     would change two knobs and blur the signal. If 4/4 alone
//     fails to recover ranking, the next descendant gets a clean
//     read on the move/prod axis. If 4/4 recovers ranking, then
//     the move/prod allocation was fine and the asymmetric tech
//     was the actual problem.
//   - This is strictly more conservative than the parent: the bet
//     reverts to the configuration that two same-chassis winners
//     (g13_b41df9, g16_e79590) and the byte-identical-strategy
//     winner (g15_8c3a18) have validated. It is exactly the
//     "test 5/3 isolated" experiment the parent staked out, with
//     the result now visible in season #140's head-to-head data.
//
// Failure mode: if the season #137 g6_53407c result was the
// signal and season #140 was sample noise, reverting to 4/4
// gives up the kill-margin amplification on close matchups and
// drops a placement or two on offense-first head-to-heads.
// Bounded downside: 1 point moved, exact destination is the
// validated ancestor tech, and the parent commentary already
// documented this as the response to "5/3 is brittle on this
// chassis" evidence.
//
// Strategy code is byte-identical to parent g20 (which inherits
// through g19 -> g18 -> g17 -> g16 -> g15 via spread). Only the
// tech field is overridden.
export default {
  ...parent,
  name: "Conqueror_g21_e2aa5a",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g20_43253a with atk/def reverted to symmetric: {move:76, stack:0, prod:16, atk:4, def:4}. Backs out the 5/3 bet after season #140's byte-identical-strategy A/B loss to g15_8c3a18.",
  summary: `Parent Conqueror_g20_43253a took a one-point shift
def->atk on top of the lineage's prod-heavy chassis, going from
{move:76, prod:16, atk:4, def:4} to {move:76, prod:16, atk:5, def:3}.
The bet was grounded on one datapoint: g6_53407c beating g19 in
season #137 with that exact asymmetry.

Season #140 produced a cleaner verdict in the opposite direction.
Five losses, three of them to bots running symmetric atk:4/def:4
(g15_8c3a18 at seed=243, g16_e79590 at seed=222, g17_397562 at
seed=205). The seed=243 loss is the most informative: g15_8c3a18
shares byte-identical strategy code with the parent (the parent
inherits from g15 through the g20<-g19<-g18<-g17<-g16<-g15 spread
chain). With code held constant, that head-to-head is a tech-only
A/B test. g15's tech is {move:80, prod:12, atk:4, def:4}; parent's
is {move:76, prod:16, atk:5, def:3}; g15 won.

This descendant reverts ONLY the atk/def asymmetry to 4/4. move
stays at 76 and prod stays at 16 because those are a separate
live experiment - bundling move/prod into the same descendant
would change two knobs and blur the signal. If 4/4 alone recovers
ranking, the move/prod allocation was fine and the asymmetric
tech was the issue. If 4/4 does not recover ranking, the next
descendant gets a clean read on the move/prod axis.

The parent's own spawn comment documented the failure mode that
season #140 looks like: "if the lineage's recent atk:4/def:4
winners had it right and 5/3 is genuinely brittle on this chassis,
mirror matches against atk:4 cousins expose def:3 to faster
kills than the atk:5 bonus recovers". Three of five losses are to
atk:4/def:4 cousins. This is the documented response to that
evidence.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
