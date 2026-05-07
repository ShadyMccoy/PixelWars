import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

// Trinity's three-in-a-row kernels, mirrored from Conqueror.
const KERNELS = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
];

const OFFSETS = KERNELS.map((k) => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const w = k[i][j];
      if (w !== 0) out.push(i * 5 + j, w);
    }
  }
  return out;
});

const ENGINE_BONUS = 1.4;

// Tech-aware Conqueror.
//
// The parent uses Conqueror's hardcoded `needed = enemy / 1.4 + 0.6`,
// but with tech atk=4 the actual attacker bonus is 1.4 * atk_mult =
// 1.4 * 0.952 = 1.333. The 0.6 fixed margin papers over this — every
// kill still lands — but it consistently over-commits by ~0.3-0.5
// strength per attack against weak enemies, and ignores the
// defender's def tech entirely (a Fortress with def_mult 1.64 would
// shrug off attacks the bot believes are killing blows).
//
// This descendant inherits the parent's proven move-heavy tech but
// computes `needed` from the *actual* effective bonus on the field:
// my atk_mult (mine, known), the strongest enemy's def_mult (read
// off their player), and a tighter safety margin. Net: more attacks
// per turn from the same strength budget, and correct sizing against
// high-def opponents instead of bouncing off them.
export default {
  ...Conqueror,
  name: "Conqueror_g2_083569",
  description: "Conqueror with tech-aware kill sizing on top of g1's move-heavy tech.",
  summary: `Inherits Conqueror_g1_879a88's tech (move=90, stack=0,
prod=2, atk=4, def=4) — that loadout was the GA's biggest gainer
and dominated season #42 with no recorded losses, so I'm not
touching it.

The change is in act(): instead of the hardcoded
'needed = enemy/1.4 + 0.6' kill formula, this descendant computes
the effective attacker bonus per-attack from the actual tech
multipliers in play:

  effBonus = ENGINE_BONUS * myAtkMult / enemyDefMult
  needed   = enemy / effBonus + 0.3

Why this should help:
  1. With atk=4, my atk_mult is 0.952, so the real bonus is 1.333,
     not 1.4. The parent's fixed 0.6 margin always covers this,
     but at the cost of ~0.3-0.5 wasted strength per kill against
     weak enemies. Tighter margin frees that strength for the next
     attack.
  2. Against Fortress-style opponents (def_mult up to 1.64), the
     parent's formula under-commits and bounces. This descendant
     reads the defender's tech and scales up appropriately.
  3. Against atk-heavy opponents we never read their atk; only
     def_mult of the unit being attacked matters for the kill.

Risk: tighter margin (0.3 vs 0.6) means a kill that's borderline
in floating-point math could fail. The +0.3 is calibrated to
exceed the post-resolution rounding the engine uses (death below
0.5 strength) without too much waste.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const neighbors = tile.neighbors;
    const pid = viewer.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const myAtkMult = (viewer.techMults && viewer.techMults.atk) || 1;

    const ranked = [];
    for (let k = 0; k < 4; k++) {
      if (!neighbors[k]) continue;
      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      ranked.push([score, k]);
    }
    ranked.sort((a, b) => b[0] - a[0]);

    for (let r = 0; r < ranked.length; r++) {
      const dir = ranked[r][1];
      const target = neighbors[dir];
      const armies = target.armies;

      let friendlyArmy = null;
      let enemy = 0;
      let enemyDefMult = 1;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) {
          friendlyArmy = a;
        } else {
          enemy += a.strength;
          // Use the strongest defender's tech as the limiting factor.
          // Mixed-owner enemy stacks are rare but possible.
          const m = a.player.techMults;
          const d = (m && m.def) || 1;
          if (d > enemyDefMult) enemyDefMult = d;
        }
      }

      if (friendlyArmy) {
        const cap = friendlyArmy.maxStrength;
        if (friendlyArmy.strength >= cap - 0.5) continue;
        const room = cap - friendlyArmy.strength;
        const want = (army.strength - friendlyArmy.strength) / 2;
        const power = Math.min(sLimit, room, Math.max(0.6, want));
        if (power > 0.5) {
          army.attack(target, power);
          return;
        }
        continue;
      }

      if (enemy > 0) {
        const effBonus = (ENGINE_BONUS * myAtkMult) / enemyDefMult;
        const needed = enemy / effBonus + 0.3;
        if (needed > sLimit) continue;
        army.attack(target, needed);
        return;
      }

      army.attack(target, sLimit);
      return;
    }
  },
};
