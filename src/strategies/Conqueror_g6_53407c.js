import parent from "./Conqueror_g5_f15d3e.js";

// Parent g5_f15d3e dominated season #119 with no recorded losses, so
// the strategy code (Pass 1 hemisphere-weighted kill scoring, Pass 2
// Conqueror fallback, Pass 3 stalemate stencil) is left strictly
// intact - no thesis change to graft, no obvious miss to patch.
//
// The under-explored axis the spawn prompt calls out is tech. The
// parent's strategy is unambiguously offense-leaning: every pass
// either picks a kill, lets Conqueror grab/balance, or steers toward
// the closest beatable enemy. atk and def are currently symmetric at
// 4/4. Shift one point def -> atk: kills are the dominant decision
// node, so amplifying attacker output should pay off more often than
// stiffening the defenders (we already kill before being attacked
// when Pass 1 fires). move:90 is preserved because the garrison
// floor is what lets Pass 3's stencil-pathing actually reach
// targets, and prod:2 / stack:0 are the parent's settled choices.
//
// Hypothesis: against neighbors that match the parent's tech
// (especially the cousin lineage at atk:4/def:4), atk:5 vs their
// def:4 nudges marginal kill margins above the BONUS=1.4 commit
// threshold one turn earlier, compounding into earlier territory
// gain. The risk is in mirror match-ups where their atk:4 vs our
// def:3 also bites earlier - but Pass 1 prefers killing first, and
// move:90 keeps a garrison floor under those defenders anyway.
export default {
  ...parent,
  name: "Conqueror_g6_53407c",
  author: "claude",
  version: 1,
  description:
    "g5_f15d3e with one tech point shifted def->atk to amplify the offense-leaning kill priority.",
  summary: `Strategy code is identical to parent Conqueror_g5_f15d3e
(hemisphere-weighted Pass 1, Conqueror fallback Pass 2, stalemate
stencil Pass 3). The parent dominated season #119 with no recorded
losses, so there is no loss signal to chase in code.

The change is one point of tech, def -> atk, taking
{move:90, stack:0, prod:2, atk:4, def:4}
to
{move:90, stack:0, prod:2, atk:5, def:3}.

Rationale: every decision branch in this strategy is offense-first
(beatable kill, then Conqueror grab/balance, then steer toward the
closest beatable enemy). atk multiplies the output side of those
decisions; def only matters on turns when an enemy reaches us
without us having killed them first, which Pass 1 actively avoids.
move stays at 90 because Pass 3 pathing depends on garrison-floor
movement reach, and prod:2 / stack:0 are the lineage's converged
choices. Against the cousin Conquerors at atk:4/def:4, the
asymmetry should nudge marginal kill margins above the BONUS=1.4
commit threshold roughly one turn earlier in close match-ups.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 5, def: 3 },
};
