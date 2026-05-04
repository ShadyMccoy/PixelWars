import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Cautious",
  author: "core",
  version: 1,
  description: "Sits on its hands until well above 70% strength, then plays SlowAndSteady.",
  act(army, game) {
    if (army.strength < army.maxStrength * 0.7) return;
    SlowAndSteady.act(army, game);
  },
};
