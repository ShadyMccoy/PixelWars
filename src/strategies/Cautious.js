import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Cautious",
  author: "core",
  version: 1,
  description: "Sits on its hands until well above 70% strength, then plays SlowAndSteady.",
  summary: `Tax the impatient. Skip every tick until we are above 70% of
maxStrength, then act like SlowAndSteady. Idea: armies regenerate
passively, and a tile with three full-strength armies on it is worth
more than three half-strength armies spread across three tiles. By
refusing to move thin, we always engage from a position of strength.
The risk is being caught flat-footed — if a Berserker or Aggressive
neighbor commits to us before we cross the threshold, we eat the
attack without responding.`,
  act(army, game) {
    if (army.strength < army.maxStrength * 0.7) return;
    SlowAndSteady.act(army, game);
  },
};
