import parent from "./Conqueror_g16_e79590.js";

// Hypothesis (one knob): shift 2 points prod -> def.
// New tech: {move:78, stack:0, prod:12, atk:4, def:6}.
//
// Why:
//   - Parent g16_e79590 finishes very close-but-not-quite: in
//     season #133 it placed #2 of 6 in four out of five recorded
//     losses (seeds 245, 234, 229, 221) and #5 in one (seed 226).
//     That distribution says the chassis has the offense to push
//     to runner-up but is bleeding out the final exchange. The
//     marginal output point is not what's missing — closing
//     survival is.
//   - The bots that took those #1 slots include g11_cb02bc, which
//     beat g10's strategy by REBALANCING TECH ONLY: it shifted
//     hard into def (4 -> 16) on the same kernel. The brief
//     explicitly flags tech as "historically under-explored" and
//     points to the def axis as currently under-claimed in this
//     lineage. The parent's strategy code is the descendant of
//     g8_9d8b65's hemisphere-weighted Pass 1 + path-clear Pass 3,
//     neither of which has any "abort-pyrrhic-kill" guard — so
//     it commits aggressively and pays the counter, which a
//     thicker def floor blunts.
//   - Parent extended the move->prod direction one step beyond
//     g13 (prod 12 -> 14). prod's slope at MARGIN=0.45 compounds
//     well, but at prod:14 we're past the point where the next
//     point pays for itself versus a def:4 floor that's taking
//     full incoming on close 2nd-place finishes. Reverting just
//     2 points (prod 14 -> 12) restores g13's prod allocation
//     while moving the freed budget into def (4 -> 6).
//   - Symmetry: atk stays at 4, so atk/def is now 4/6, mildly
//     defense-leaning. Per g15's loss, asymmetry on this chassis
//     hurts when the asymmetry favors offense (both sides' kill
//     bands widen by the same proportion). Defense-leaning
//     asymmetry has the OPPOSITE sign in head-to-head: it
//     narrows our incoming-kill window without changing our
//     outgoing-kill window's relative position vs. cousins, since
//     they all run BONUS=1.4 hardcoded and only tech multipliers
//     differ.
//
// Failure mode: if prod was actually still compounding strongly
// at the prod:14 step (parent's bet), output drops ~14% (12/14)
// per turn and the bot loses the tempo edge that puts it at #2
// in the first place. Bounded downside: only 2 points moved, and
// the same rebalance is empirically validated by g11_cb02bc on
// a related chassis. Strategy code is byte-identical to parent
// (inherited via spread); only tech changes.
export default {
  ...parent,
  name: "Conqueror_g17_6d0fb0",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g16_e79590 with 2 points shifted prod -> def: {move:78, stack:0, prod:12, atk:4, def:6}.",
  summary: `Parent Conqueror_g16_e79590 placed #2 of 6 in four of
its five season #133 losses and #5 in the fifth. That pattern
says the chassis pushes to runner-up but loses the closing
exchange. The marginal output point isn't missing — closing
survival is.

Direct precedent for the fix: Conqueror_g11_cb02bc beat the
g10_f5e8bf strategy by REBALANCING TECH ONLY, shifting hard
into def (4 -> 16) on an identical kernel. The spawn brief
flags tech as historically under-explored and points to the
def axis as currently under-claimed in this lineage. The parent's
strategy code (hemisphere-weighted Pass 1 + path-clear Pass 3,
inherited from g8_9d8b65) has no abort-pyrrhic-kill guard, so
it commits aggressively and eats the counter — which a thicker
def floor blunts.

This descendant doesn't go all-in like g11. It just walks 2
points back: prod 14 -> 12 (matching g13's allocation) into def
4 -> 6. That gives up the marginal prod point that was paying
the least at this allocation, and converts it into incoming-
damage absorption where the parent is currently finishing #2
and not #1.

Tech: {move:78, stack:0, prod:12, atk:4, def:6}. atk/def is now
mildly defense-leaning (4/6). Per g15's head-to-head loss, the
sign of asymmetry matters: offense-leaning asymmetry on this
chassis is a wash on output and a loss on incoming because both
sides' kill bands widen by the same proportion. Defense-leaning
asymmetry has the opposite sign — it narrows our incoming-kill
window without changing the relative position of our outgoing
kill window vs. cousins (BONUS=1.4 is hardcoded; only tech
multipliers differ).

Failure mode: prod was still compounding at the prod:14 step
and the 14% output drop (12/14) costs the tempo edge that puts
the bot at #2 in the first place. Bounded downside: only 2
points moved, and the same rebalance direction is empirically
validated by g11_cb02bc.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field is overridden.`,
  tech: { move: 78, stack: 0, prod: 12, atk: 4, def: 6 },
};
