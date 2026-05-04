import SlowAndSteady from "./SlowAndSteady.js";
import Repel from "./Repel.js";
import Trinity from "./Trinity.js";
import Aggressive from "./Aggressive.js";
import Defender from "./Defender.js";
import Random from "./Random.js";
import Berserker from "./Berserker.js";
import Cautious from "./Cautious.js";
import Swarm from "./Swarm.js";
import Opportunist from "./Opportunist.js";
import Hunter from "./Hunter.js";
import Turtle from "./Turtle.js";
import Phalanx from "./Phalanx.js";
import Vampire from "./Vampire.js";
import Tactician from "./Tactician.js";
import Scout from "./Scout.js";
import Avalanche from "./Avalanche.js";
import Bully from "./Bully.js";
import Adaptive from "./Adaptive.js";
import Membrane from "./Membrane.js";
import { GENERATED } from "./generated.js";

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
  Opportunist,
  Hunter,
  Turtle,
  Phalanx,
  Vampire,
  Tactician,
  Scout,
  Avalanche,
  Bully,
  Adaptive,
  Membrane,
  ...GENERATED,
];

export const STRATEGIES = Object.fromEntries(STRATEGY_LIST.map((s) => [s.name, s]));

export function getStrategy(name) {
  const s = STRATEGIES[name];
  if (!s) throw new Error(`Unknown strategy: ${name}`);
  return s;
}
