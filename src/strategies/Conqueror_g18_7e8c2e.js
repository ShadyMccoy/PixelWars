import parent from "./Conqueror_g17_6d0fb0.js";

// Hypothesis (one knob): flip the direction of parent's 2-point
// prod-out shift. Parent moved prod 14 -> 12, def 4 -> 6. This
// descendant moves the same 2 prod points into atk instead.
// New tech: {move:78, stack:0, prod:12, atk:6, def:4}.
//
// Why:
//   - Parent g17_6d0fb0's bet was that def:6 would convert g16's
//     close-but-not-quite #2 finishes into #1s. Season #134 data
//     contradicts that bet: of 5 recorded losses, only ONE was a
//     #2 finish (seed 220, vs g7_efa4e0). Three were #4 of 6
//     (seeds 246, 211, 194) and one was #3 (seed 186). g16's
//     prior season pattern was #2 of 6 in 4 of 5 losses. So the
//     def:6 shift didn't just fail to convert #2s into #1s — it
//     dropped the bot OUT of the runner-up tier into mid-pack.
//   - Reading: parent isn't dying in the closing exchange, it's
//     getting outpaced earlier. Mid-pack finishes mean it never
//     reaches the late-game two-bot exchange where def:6 would
//     have mattered. The bottleneck moved from "survive the
//     final exchange" to "stay competitive on tempo through the
//     middle game". Defense doesn't help with that; output and
//     kill efficiency do.
//   - The 2-point shift magnitude is fine (parent's hypothesis
//     was structurally sound — small, reviewable, reversible).
//     What's wrong is the destination axis. Defense-leaning
//     asymmetry was supposed to narrow our incoming-kill window
//     vs cousins running atk:4/def:4, but season #134 winners
//     against the parent include g13_b41df9 (atk:4/def:4),
//     g7_efa4e0 (atk:4/def:4), g12_f23241 (atk:4/def:4) — the
//     parent lost to bots with strictly less defense. So def:6
//     isn't the missing piece.
//   - atk:6 narrows the outgoing-kill cost: with BONUS=1.4
//     hardcoded in the strategy code's `needed = enemy/BONUS +
//     MARGIN`, the strategy still computes the same nominal
//     commit, but the engine-side atk multiplier means each
//     committed point of strength does more damage, so kills
//     resolve cheaper in actual strength burned. Every saved
//     point of strength stays in the supply pool and feeds the
//     next kill. That compounds with prod:12's deployment
//     output — the chain that put g16 at #2 in the first place.
//   - Sign of asymmetry: per parent's own analysis of g15's
//     loss, asymmetry on this BONUS=1.4 chassis matters. Parent
//     argued defense-leaning asymmetry was favorable. Season
//     #134 says no. atk-leaning asymmetry tests the opposite
//     direction with the same magnitude — a clean A/B against
//     parent's def-leaning experiment.
//
// Failure mode: if the bottleneck really was the closing
// exchange (parent's thesis) and atk:6 doesn't help reach it,
// we lose 1 point of effective defense and gain 1 point of
// effective offense over g16's symmetric 4/4. Bounded downside:
// 2 points moved, identical magnitude to parent's experiment.
// Strategy code is byte-identical to parent (inherited via
// spread); only the tech field changes.
export default {
  ...parent,
  name: "Conqueror_g18_7e8c2e",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g17_6d0fb0 with the prod-out 2 points redirected from def to atk: {move:78, stack:0, prod:12, atk:6, def:4}.",
  summary: `Parent Conqueror_g17_6d0fb0 bet that shifting 2 points
prod -> def would convert g16's close-but-not-quite #2 finishes
into #1s. Season #134 contradicts that bet sharply: of 5 recorded
losses, only ONE was a #2 finish (seed 220 vs g7_efa4e0). Three
were #4 of 6 (seeds 246, 211, 194) and one was #3 (seed 186).
g16's prior pattern was #2 of 6 in 4 of 5 losses. The def:6
shift didn't fail to climb — it regressed from runner-up into
mid-pack.

Reading: the bot isn't dying in the closing exchange anymore,
it's getting outpaced earlier. Mid-pack finishes mean it never
reaches the late-game exchange where the +2 def would matter.
The bottleneck moved from "survive the final exchange" to "stay
competitive on tempo through the middle game". Defense doesn't
help with that; outgoing kill efficiency does.

This descendant keeps parent's 2-point shift magnitude (same
small, reviewable, reversible step) but flips the destination
axis from def to atk. New tech: {move:78, stack:0, prod:12,
atk:6, def:4}.

Direct counter-evidence to parent's "def-leaning is favorable"
thesis: every recent winner against the parent in season #134
runs atk:4/def:4 (g13_b41df9, g7_efa4e0, g12_f23241). Parent
lost to bots with strictly less defense, which contradicts the
"narrow incoming-kill window" pitch. atk-leaning asymmetry is
the symmetric A/B: same 2 points out of prod, opposite tech axis.

Mechanism: the strategy's kill loop computes
\`needed = enemy/BONUS + MARGIN\` with BONUS=1.4 hardcoded, then
commits exactly that. Engine-side atk multiplies the actual
damage that commitment does, so kills resolve cheaper in real
strength burned. Every saved point of strength stays in the
supply pool and feeds the next kill. That compounds with
prod:12's deployment output — the chain that put g16 at #2 in
the first place.

Failure mode: if the bottleneck really was the closing exchange
and atk:6 doesn't help reach it, we lose 1 effective defense
point and gain 1 effective offense point over g16's symmetric
4/4. Bounded downside: 2 points moved, identical magnitude to
parent's experiment. Strategy code byte-identical to parent
(inherited via spread); only the tech field changes.`,
  tech: { move: 78, stack: 0, prod: 12, atk: 6, def: 4 },
};
