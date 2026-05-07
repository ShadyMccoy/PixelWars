import Empire from "./Empire.js";

// Settler: a Pacifist_02 clone (the active pool's #1 by PL rating) with an
// Empire-mode endgame switch. Pacifist_02 wins by surviving — it only ever
// expands into empty tiles, never picking a fight, so it never loses
// strength. The PL rating system, which scores by per-match finish position
// across all bots and not just first place, rewards that survival heavily:
// in a 6-bot match where everyone else murders each other, Pacifist_02
// finishes 2nd or 3rd alive, scoring 4-5 points without lifting a finger.
//
// The hole in that strategy: once the map is colonized, a pure pacifist
// sits forever. Settler patches that. We watch our local 5x5 view; the
// instant it has zero empty tiles, expansion is exhausted and we hand
// control to Empire's full attack scoring (kills, suicide trades, focus
// enemy, alignment). Until then we play vanilla Pacifist_02: pick the
// first adjacent empty tile and shove attackPower into it. No threshold
// gate (Pacifist_02 has thresh=0.0, frac=1.0) — fire as soon as we can.

export default {
  name: "Settler",
  author: "claude",
  version: 1,
  description: "Pacifist by default — never attacks occupied tiles. Switches to Empire's full attack mode once the map is fully colonized.",
  summary: `If you can't beat the rating system, join it. The active pool
is dominated by Pacifist_02, a bot that never attacks anything occupied
yet sits at rank #1 — the PL rating gives big credit for surviving FFA
matches where everyone else burns each other down. Settler clones that
playbook: as long as the global map has any empty tile, we behave
exactly like Pacifist_02 — expand into the first adjacent empty tile
with full attackPower, otherwise sit. No suicide trades, no kills, no
flocking, no friendly transfers. Pure expansion-or-idle.

The moment global colonization completes (sum of player territories
equals total map tiles), expansion is over and we hand the army to
Empire's full scoring: clean kills, focus enemy bonus, suicide trades
when at cap, march. The endgame switch flips us from "the safest bot
in the pool" to "the bot that breaks saturated borders." A *local*
endgame check (no empties in our 5x5) fires too early — it triggers
the moment our column meets a neighbor's, while half the map is still
open land we'd rather grab passively than fight for.

Two bets stack: (1) we accumulate Pacifist_02's survival rating points
in every match, since the early-game behavior is identical;
(2) Pacifist_02 currently degenerates into a stalemate sit-still once
the map is colonized — Settler converts those wasted ticks into
territory grabs. Net should be a strict improvement over Pacifist_02
in any match where colonization completes.`,

  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const attackPower = army.attackPower;
    if (attackPower <= 0.6) return;

    // Global endgame check: are there any empty tiles left on the map?
    // Local-only saturation (no empties in 5x5) fires too early — it
    // triggers as soon as our column meets a neighbor, while there's
    // still open land elsewhere. Pacifists win by never engaging until
    // forced; we follow the same rule globally.
    const total = game.map.width * game.map.height;
    let occupied = 0;
    const players = game.players.list;
    for (let i = 0; i < players.length; i++) occupied += players[i].totals.territory;
    if (occupied >= total) {
      Empire.act(army, game);
      return;
    }

    // Pacifist_02: scan neighbors for the first empty tile, shove
    // attackPower in. Pacifist_02 has pickMode="min" with all empties
    // tying at score 0, so the lowest-index empty wins.
    const neighbors = tile.neighbors;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (t && t.armies.length === 0) {
        army.attack(t, attackPower);
        return;
      }
    }
    // Surrounded by occupied tiles in adjacency, but stencil sees an
    // empty 1-2 steps away. Sit and wait — the empty will reach us
    // (or our neighbor consolidates and the endgame switch flips).
  },
};
