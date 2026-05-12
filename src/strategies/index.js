// Strategy pool for the stratagem-experiment branch. Only plan(game,
// player)-style bots live here — the legacy act(army, game) callback
// no longer runs on this branch, so the 250+ bred bots from master
// would just be inert filler. They're still in the repo for reference
// (and the tournament/ experiment scripts that import them directly
// still work), but they don't show up in the UI pool, league, or
// HUD dropdown.

import Painter from "./Painter.js";
import Fortress from "./Fortress.js";
import { CHARACTER_TECHS } from "./characterTechs.js";
import { NEUTRAL_TECH } from "../core/Tech.js";

export const ALL_STRATEGY_LIST = [
  Painter,
  Fortress,
];

// Attach character techs in place so every loaded strategy carries an
// explicit .tech, even bots that would otherwise default to neutral.
// Resolution: bot's own `tech` field (set in the strategy file) wins;
// then CHARACTER_TECHS map; then neutral.
for (const s of ALL_STRATEGY_LIST) {
  if (s.tech) continue;
  s.tech = CHARACTER_TECHS[s.name] ?? { ...NEUTRAL_TECH };
}

// STRATEGY_LIST and ARCHIVED_STRATEGY_LIST are kept for API compat with
// the HUD / league / tournament glue. Nothing is archived on this
// branch.
export const STRATEGY_LIST = ALL_STRATEGY_LIST;
export const ARCHIVED_STRATEGY_LIST = [];

export const STRATEGIES = Object.fromEntries(STRATEGY_LIST.map((s) => [s.name, s]));
export const ARCHIVED_STRATEGIES = {};
export const ALL_STRATEGIES = Object.fromEntries(ALL_STRATEGY_LIST.map((s) => [s.name, s]));

export function getStrategy(name) {
  const s = ALL_STRATEGIES[name];
  if (!s) throw new Error(`Unknown strategy: ${name}`);
  return s;
}

export function isArchived(_name) {
  return false;
}
