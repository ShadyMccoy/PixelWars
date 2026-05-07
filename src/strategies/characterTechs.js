// Character techs: per-strategy default tech loadouts that match the
// bot's narrative archetype. Strategies without an entry here default
// to neutral 20/20/20/20/20.
//
// Tech keys are partial; missing points are spread evenly across the
// unspecified knobs by techFromPartial. So {atk:60, move:40} means
// "60 atk, 40 move, 0 elsewhere"; {atk:70} means "70 atk, 30/3
// across the rest" → {move:10, stack:10, prod:10, atk:70, def:0}.
//
// These reflect personality, not optimization. Calibration ran across
// all strategies with neutral tech; any tournament that wants
// "pre-techs" behavior can pass --neutral-techs (not implemented; just
// override per entry).

import { techFromPartial } from "../core/Tech.js";

const RAW = {
  // Pure aggression
  Berserker:  { atk: 60, move: 40 },
  Aggressive: { atk: 60, move: 40 },
  Crusader:   { atk: 50, move: 50 },
  Spearhead:  { atk: 50, move: 50 },
  Lance:      { atk: 60, move: 40 },
  Vanguard:   { atk: 50, move: 50 },
  Bully:      { atk: 60, move: 40 },
  Conqueror:  { atk: 50, stack: 50 },
  Onslaught:  { atk: 60, move: 40 },

  // Defensive / fortress
  Turtle:     { def: 50, stack: 50 },
  Defender:   { def: 60, stack: 40 },
  Bulwark:    { def: 70, stack: 30 },
  TideWall:   { def: 60, stack: 40 },
  Phalanx:    { def: 50, stack: 50 },
  Citadel:    { def: 50, stack: 50 },
  Cautious:   { def: 40, prod: 60 },

  // Slow-burn / engine
  Vampire:    { prod: 50, atk: 50 },
  Avalanche:  { stack: 50, atk: 50 },
  Surge:      { prod: 40, atk: 60 },

  // Movement / scout
  Swarm:      { move: 50, prod: 50 },
  Scout:      { move: 60, stack: 40 },
  Wildfire:   { move: 50, prod: 50 },
  Stalker:    { move: 50, atk: 50 },

  // Conductor: balanced-with-edge
  Conductor:  { stack: 40, prod: 30, def: 30 },

  // Painter-based bots
  Frontier:      { prod: 50, atk: 50 },           // interior feeds front
  PressureSink:  { atk: 40, def: 40, prod: 20 },  // attack weak, brace strong
  CitadelSortie: { stack: 50, atk: 50 },          // stockpile + concentrated push

  // Generalists — formerly neutral. The original "leave it 20/20/20/20/20"
  // policy left half the active roster carrying no archetype, which made
  // tech matchups boring (any neutral-vs-themed pairing was just a
  // strategy comparison). These pull each generalist toward the slope of
  // their thesis without giving up the strategy itself.
  SlowAndSteady: { prod: 40, def: 30, stack: 30 }, // patient regrowth, soak losses
  Repel:         { move: 40, prod: 30, def: 30 },  // outward bias rewards mobility
  Trinity:       { atk: 40, move: 40, stack: 20 }, // flocking pushes strength forward
  Random:        { move: 50, atk: 50 },            // pure chaos: more swings, faster
  Opportunist:   { def: 40, prod: 40, stack: 20 }, // never bleeds, snowballs slow
  Adaptive:      { stack: 30, prod: 30, def: 20, atk: 20 }, // jack-of-all-trades edge
  Membrane:      { def: 40, move: 30, prod: 30 },  // hold borders, pump interior

  // New roster bots (registered alongside)
  Pinwheel:    { atk: 40, move: 40, stack: 20 },   // synchronous sweep
  Anvil:       { def: 60, stack: 40 },             // counter-puncher
  Skirmisher:  { move: 50, atk: 50 },              // chip damage, no overcommit
  Tempo:       { stack: 50, atk: 50 },             // stockpile then blitz
};

export const CHARACTER_TECHS = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW).map(([name, partial]) => [name, techFromPartial(partial)]),
  ),
);
