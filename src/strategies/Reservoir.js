import Parent from "./Conqueror_g13_b41df9.js";

const BONUS = 1.4;

// Detect tiles where the chassis would otherwise produce a
// "wasted" tick — defined as: no enemy adjacent, no empty
// neighbor, and at least one friendly neighbor at or near maxStrength
// (which the chassis fallback would attempt to reinforce, paying
// +1 move overhead for ~zero strength delivered).
function isWastedTick(tile, pid) {
  const n = tile.neighbors;
  let hasMaxedFriendly = false;
  for (let i = 0; i < 4; i++) {
    const t = n[i];
    if (!t) continue;
    const armies = t.armies;
    if (armies.length === 0) return false; // empty = real action
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id !== pid) return false; // enemy = real action
      if (a.strength >= a.maxStrength - 0.5) hasMaxedFriendly = true;
    }
  }
  return hasMaxedFriendly;
}

export default {
  name: "Reservoir",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis with one strict upgrade: idle on interior ticks where the chassis would otherwise reinforce a maxed friendly (paying the +1 move overhead for ~zero delivered strength). Chassis runs verbatim everywhere else.",
  summary: `Cost formula on this ruleset is power * distance + 1.
The chassis's Pass 3 stencil fallback occasionally walks the
army into a "reinforce a maxed friendly" move — the engine clamps
the actual delivered strength to the friendly's remaining room
(near zero), but the +1 move overhead is still paid in full.
Multiplied across many tiles and many ticks, that overhead is
real budget loss.

Reservoir's only change: detect this exact case before invoking
the chassis. If the tile has no empty neighbor, no enemy
neighbor, and at least one maxed friendly neighbor, idle
instead of acting. The chassis would have done something
near-useless on this tick; idling saves the +1 overhead and
lets the tile's strength + budget continue to accumulate for a
future tick where a real opportunity appears.

In every other case (any enemy adjacent, any empty neighbor,
chassis Pass 1/2 finds a real kill or expansion), defer to the
chassis verbatim. Reservoir is at minimum chassis-equivalent
and strictly better on the wasted-reinforce ticks the chassis
otherwise burns.

Tech mirrors g14_8d5369's chassis loadout {move:76, stack:0,
prod:16, atk:5, def:3}. The idle behavior is pure addition.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Parent.act(army, game);
      return;
    }
    const pid = army.player.id;

    if (isWastedTick(tile, pid)) return;

    Parent.act(army, game);
  },
};
