import Membrane from "./Membrane.js";

// Membrane with extreme MOVE tech (90/0/2/4/4 instead of the
// character-default {def:40, move:30, prod:30}). Membrane's
// character tech leaned defensive, but the GA's cross-strategy
// sweep showed move-heavy tech boosts Membrane from 14.5% to 91.5%
// wins (+77 pp) against the elite top-10 pool. The defensive flavor
// of the original loses to the throughput unlock of move-heavy.
export default {
  ...Membrane,
  name: "Membrane_g1_b9f1d5",
  description: "Membrane with extreme move tech (90/0/2/4/4) - GA-discovered.",
  summary: `Identical Membrane behavior, but tech overridden to
{move:90, stack:0, prod:2, atk:4, def:4} from the original
defensive {def:40, move:30, prod:30}. Lower garrison floor on
attacks turns Membrane's border-holding into border-pushing
without changing any logic.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
};
