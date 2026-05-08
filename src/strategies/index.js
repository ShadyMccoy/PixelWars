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
import Crusader from "./Crusader.js";
import Vanguard from "./Vanguard.js";
import Spearhead from "./Spearhead.js";
import Surge from "./Surge.js";
import Wildfire from "./Wildfire.js";
import Bulwark from "./Bulwark.js";
import TideWall from "./TideWall.js";
import Conductor from "./Conductor.js";
import Conqueror from "./Conqueror.js";
import Stalker from "./Stalker.js";
import Citadel from "./Citadel.js";
import Lance from "./Lance.js";
import Frontier from "./Frontier.js";
import PressureSink from "./PressureSink.js";
import CitadelSortie from "./CitadelSortie.js";
import Pinwheel from "./Pinwheel.js";
import Anvil from "./Anvil.js";
import Skirmisher from "./Skirmisher.js";
import Tempo from "./Tempo.js";
import Empire from "./Empire.js";
import Settler from "./Settler.js";
import Drumline from "./Drumline.js";
import Sniper from "./Sniper.js";
import Hammer from "./Hammer.js";
import Stockpile from "./Stockpile.js";
import Reservoir from "./Reservoir.js";
import Coward from "./Coward.js";
import Pulse from "./Pulse.js";
import Escort from "./Escort.js";
import { GENERATED } from "./generated.js";
import { DESCENDANTS } from "./descendants.js";
import { ARCHIVED } from "./archive.js";
import { CHARACTER_TECHS } from "./characterTechs.js";
import { NEUTRAL_TECH } from "../core/Tech.js";

// Every bot ever defined. Order matters — it's the canonical listing for
// `--list` and (after filtering) the default tournament pool.
export const ALL_STRATEGY_LIST = [
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
  Crusader,
  Vanguard,
  Spearhead,
  Surge,
  Wildfire,
  Bulwark,
  TideWall,
  Conductor,
  Conqueror,
  Stalker,
  Citadel,
  Lance,
  Frontier,
  PressureSink,
  CitadelSortie,
  Pinwheel,
  Anvil,
  Skirmisher,
  Tempo,
  Empire,
  Settler,
  Drumline,
  Sniper,
  Hammer,
  Stockpile,
  Reservoir,
  Coward,
  Pulse,
  Escort,
  ...GENERATED,
  ...DESCENDANTS,
];

// Attach character techs in place so every loaded strategy carries an
// explicit .tech, even bots that would otherwise default to neutral.
// Resolution: bot's own `tech` field (set in the strategy file) wins;
// then CHARACTER_TECHS map; then neutral. Backfilling neutral here
// (rather than letting arena.js's normalizeEntry fall back implicitly)
// means tooling like the spawn agent's prompt always sees the correct
// tech without a special case for "tech unset = neutral".
for (const s of ALL_STRATEGY_LIST) {
  if (s.tech) continue;
  s.tech = CHARACTER_TECHS[s.name] ?? { ...NEUTRAL_TECH };
}

const ARCHIVED_SET = new Set(ARCHIVED);

// STRATEGY_LIST is what tournaments and the HUD dropdown see by default —
// archived bots are filtered out so they don't keep entering pools and
// crowding the UI. ALL_STRATEGY_LIST is preserved above for CLI listings
// and for replay lookup (saved entries may reference archived bot names).
export const STRATEGY_LIST = ALL_STRATEGY_LIST.filter((s) => !ARCHIVED_SET.has(s.name));
export const ARCHIVED_STRATEGY_LIST = ALL_STRATEGY_LIST.filter((s) => ARCHIVED_SET.has(s.name));

// Active map (HUD dropdown, default tournament). Archived map (rare).
// All-by-name (replay/league lookup, getStrategy).
export const STRATEGIES = Object.fromEntries(STRATEGY_LIST.map((s) => [s.name, s]));
export const ARCHIVED_STRATEGIES = Object.fromEntries(ARCHIVED_STRATEGY_LIST.map((s) => [s.name, s]));
export const ALL_STRATEGIES = Object.fromEntries(ALL_STRATEGY_LIST.map((s) => [s.name, s]));

// getStrategy looks at the full set so saved replays of archived bots
// still resolve. Tournaments default to STRATEGY_LIST so they never pick
// up archived bots unintentionally.
export function getStrategy(name) {
  const s = ALL_STRATEGIES[name];
  if (!s) throw new Error(`Unknown strategy: ${name}`);
  return s;
}

export function isArchived(name) {
  return ARCHIVED_SET.has(name);
}
