#!/usr/bin/env node
// Audit: prove Membrane's periodic strength drops are self-inflicted clamp
// loss, not enemy combat. We hook Army.attack to record, per tick:
//   - selfClamp: power dumped into a friendly that was already at maxArmy
//                (or lifted past it) — pure mass evaporated by the cap.
//   - selfTransfer: power that landed safely on an under-cap friendly
//                   (mass conserved).
//   - enemyAttack: power spent attacking an enemy or empty tile.
// Then we compare those bursts to the per-tick total-strength delta.
//
//   node tournament/clamp_audit.js --seed 57

import { Game } from "../src/core/Game.js";
import { Army } from "../src/core/Army.js";
import { Player } from "../src/core/Player.js";
import { mulberry32 } from "../src/core/rng.js";
import { getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";

function parseArgs(argv) {
  const opts = {
    seed: 57,
    map: "lab1",
    lineup: ["Membrane", "Citadel", "Bulwark", "TideWall", "Crusader", "Trinity"],
    bot: "Membrane",
    ticks: 6000,
    window: [400, 500],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    switch (a) {
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--lineup": opts.lineup = next().split(",").map(s => s.trim()); break;
      case "--bot": opts.bot = next(); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--window": opts.window = next().split("-").map(s => parseInt(s, 10)); break;
      default: console.error(`Unknown option: ${a}`); process.exit(1);
    }
  }
  return opts;
}

function shuffleSeeded(arr, seed) {
  const rng = mulberry32(seed * 2654435761 >>> 0 || 1);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const map = MAPS[opts.map];
const lineup = opts.lineup.map(getStrategy);

const game = new Game({ ...map.config, seed: opts.seed, maxHistory: 0 });
const players = lineup.map((s, i) => new Player({
  name: `${s.name}#${i + 1}`,
  color: "#fff", accent: "#fff",
  strategy: s,
}));
players.forEach(p => game.addPlayer(p));
const slotOrder = shuffleSeeded(lineup.map((_, i) => i), opts.seed);
map.positions(lineup.length).forEach((pos, i) => {
  game.placeArmy({ x: pos.x, y: pos.y, player: players[slotOrder[i]], strength: 1 });
});

const watched = players[opts.lineup.indexOf(opts.bot)];
const wid = watched.id;

// Hook Army.attack. Original logic preserved; we just bookkeep what the
// attacker spent and how much actually arrived at the receiver.
const origAttack = Army.prototype.attack;
const audit = []; // per-tick { selfClamp, selfTransfer, enemyAttack, combatLoss }
let cur = { selfClamp: 0, selfTransfer: 0, enemyAttack: 0, combatLoss: 0 };
Army.prototype.attack = function (tile, power) {
  if (this.player.id !== wid || !this.isAttackValid(tile, power)) {
    return origAttack.call(this, tile, power);
  }
  const arms = tile.armies;
  let friendly = null;
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    if (a.alive && a.player.id === wid) { friendly = a; break; }
  }
  if (friendly) {
    const room = friendly.maxStrength - friendly.strength;
    const arrived = Math.max(0, Math.min(power, room));
    cur.selfClamp += power - arrived;
    cur.selfTransfer += arrived;
  } else {
    cur.enemyAttack += power;
  }
  return origAttack.call(this, tile, power);
};

// Bracket every per-tile resolveConflicts() to measure mass destroyed by
// combat. `before` sums the watched player's strength on the tile prior
// to resolution, `after` sums it afterward — the drop is mass annihilated
// in combat (defender wiped, attacker died on enemy tile, or winner shed
// real-loss to take the tile).
import { Tile } from "../src/core/Tile.js";
const origResolve = Tile.prototype.resolveConflicts;
Tile.prototype.resolveConflicts = function () {
  let before = 0;
  for (const a of this.armies) if (a.alive && a.player.id === wid) before += a.strength;
  origResolve.call(this);
  let after = 0;
  for (const a of this.armies) if (a.alive && a.player.id === wid) after += a.strength;
  if (before > after) cur.combatLoss += before - after;
};

const series = []; // total strength per tick
while (game.tick < opts.ticks) {
  game.step(1 / 30);
  if (!game.livingPlayers().includes(watched)) break;
  series.push(watched.totals.strength);
  audit.push(cur);
  cur = { selfClamp: 0, selfTransfer: 0, enemyAttack: 0, combatLoss: 0 };
  if (game.livingPlayers().length <= 1) break;
}

// Slice to the requested window and print.
const [lo, hi] = opts.window;
const a = Math.max(0, lo), b = Math.min(series.length, hi);
console.log(`\nseed=${opts.seed} map=${opts.map} bot=${opts.bot}`);
console.log(`watching ticks ${a}..${b - 1}, total signal length=${series.length}\n`);
console.log(`tick   strength   delta  combatLoss  selfClamp  selfTransfer  enemyAttack`);
for (let t = a; t < b; t++) {
  const delta = t === 0 ? 0 : series[t] - series[t - 1];
  const ev = audit[t];
  const mark = delta < -5 ? "  <-- big drop" : "";
  console.log(
    `${String(t).padStart(4)}  ${series[t].toFixed(2).padStart(8)}  ` +
    `${(delta >= 0 ? "+" : "") + delta.toFixed(2)}`.padStart(8) +
    `  ${ev.combatLoss.toFixed(2).padStart(8)}  ` +
    `${ev.selfClamp.toFixed(2).padStart(8)}  ` +
    `${ev.selfTransfer.toFixed(2).padStart(11)}  ` +
    `${ev.enemyAttack.toFixed(2).padStart(11)}${mark}`,
  );
}

// Aggregate across the full match.
let totSelfClamp = 0, totSelfTransfer = 0, totEnemy = 0, totCombat = 0;
for (const ev of audit) {
  totSelfClamp += ev.selfClamp;
  totSelfTransfer += ev.selfTransfer;
  totEnemy += ev.enemyAttack;
  totCombat += ev.combatLoss;
}
console.log(`\ntotals over ${audit.length} ticks for ${opts.bot}:`);
console.log(`  combatLoss   = ${totCombat.toFixed(1)}  (mass annihilated by resolveConflicts on owned tiles)`);
console.log(`  selfClamp    = ${totSelfClamp.toFixed(1)}  (mass evaporated by friendly maxArmy cap)`);
console.log(`  selfTransfer = ${totSelfTransfer.toFixed(1)}  (mass moved into under-cap friendlies)`);
console.log(`  enemyAttack  = ${totEnemy.toFixed(1)}  (power spent on enemy / empty tiles)`);
const realLoss = totCombat + totSelfClamp;
console.log(`\n  total real strength loss = ${realLoss.toFixed(1)}`);
console.log(`    combat   = ${(100 * totCombat / realLoss).toFixed(1)}%`);
console.log(`    selfClamp= ${(100 * totSelfClamp / realLoss).toFixed(1)}%`);
