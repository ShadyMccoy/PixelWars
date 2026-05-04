import SlowAndSteady from "./SlowAndSteady.js";
import Repel from "./Repel.js";
import Trinity from "./Trinity.js";
import Aggressive from "./Aggressive.js";
import Defender from "./Defender.js";
import Random from "./Random.js";
import Berserker from "./Berserker.js";
import Cautious from "./Cautious.js";
import Swarm from "./Swarm.js";

export const STRATEGY_LIST = [
  SlowAndSteady,
  Repel,
  Trinity,
  Aggressive,
  Defender,
  Random,
  Berserker,
  Cautious,
  Swarm,
];

export const STRATEGIES = Object.fromEntries(STRATEGY_LIST.map((s) => [s.name, s]));

export function getStrategy(name) {
  const s = STRATEGIES[name];
  if (!s) throw new Error(`Unknown strategy: ${name}`);
  return s;
}
