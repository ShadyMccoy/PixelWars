import Conqueror from "./Conqueror.js";

// Conqueror with extreme MOVE tech. Biggest gainer in the GA's
// cross-strategy sweep: 5.0% -> 86.0% wins (+81 pp). Conqueror's
// character tech defaults to {atk:50, stack:50}; replacing it
// with move-heavy tech removes the stack-heavy throttle on
// attacks, letting the bot's minimum-overkill kills land with
// almost-full garrison transfer.
export default {
  ...Conqueror,
  name: "Conqueror_g1_879a88",
  description: "Conqueror with extreme move tech (90/0/2/4/4) - GA-discovered.",
  summary: `Identical Conqueror behavior; tech overridden to
{move:90, stack:0, prod:2, atk:4, def:4}. Was the biggest gainer
in the cross-strategy sweep (+81 pp from baseline 5%), suggesting
the original {atk:50, stack:50} character tech was holding it back
significantly. Stack tech adds throughput to defense but blunts
attack-heavy bots that don't need the buffer.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
};
