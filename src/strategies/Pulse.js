import Aggressive from "./Aggressive.js";

const PHASE = 3;

export default {
  name: "Pulse",
  author: "claude",
  version: 1,
  description: "Idles for two ticks out of every three to let strength accumulate, then pulses an Aggressive-style commit on the third — synchronized release across the whole army.",
  summary: `A poor man's Pinwheel/Drumline. Where those bots coordinate
direction, Pulse coordinates timing: the entire roster of armies acts
on the same global tick parity, so every commit lands at near-full
stack strength simultaneously.

Mechanism: gate on game.tick % 3 === 0. On the other two ticks every
army holds — passive regeneration runs untouched and tile budget
charges. On the pulse tick, defer to Aggressive (pick the strongest
beatable neighbor; fall back to SlowAndSteady if none). The 2:1
hold:fire ratio is a compromise: enough idle ticks to meaningfully
refill from strength loss, few enough that we don't lose tempo
against adjacent bots that act every tick.

Pulse is built for the Lanchester combat model where committed
strength scales superlinearly — a 6-strength stack that fires once
beats two 3-strength stacks that fire on alternating ticks at the
same target. The downside is that on hold ticks we're a static
target; an opponent that gets first contact mid-pulse trades into
us when we can't respond. Performs well against tick-by-tick bots
like SlowAndSteady and Cautious; loses to anyone fast enough to
exploit a hold tick (Berserker, Aggressive on contact).`,
  act(army, game) {
    if (game.tick % PHASE !== 0) return;
    Aggressive.act(army, game);
  },
};
