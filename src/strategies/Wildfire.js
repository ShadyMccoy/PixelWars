import SlowAndSteady from "./SlowAndSteady.js";
import { balanceAttack } from "./helpers.js";

const ATTACKER_BONUS = 1.4;

export default {
  name: "Wildfire",
  author: "shady",
  version: 1,
  description: "Frontier expansion with defensive reserves: balance-attacks when threatened, full-commits when safe.",
  summary: `An expansion-tuned bot that defends when needed. Each tick we
classify the four neighbors and check whether any adjacent enemy
poses a threat (their stack > 1 strength). If a threat exists we
play SlowAndSteady, whose balanceAttack keeps reserves at home
to absorb the incoming hit. If we are safe (no enemies, or only
trivial ones), we look for the best expansion target:

  - empty tile: highest priority (free territory)
  - beatable enemy (factoring 1.4x attacker bonus): score lighter
    targets first (cheap kills)

and full-commit (s-1) into it. With nothing to attack we fall
through to SlowAndSteady so an enclosed army still bleeds outward
through the friendly stack.

Thesis: the original full-commit Wildfire died constantly because
it left only 1 strength behind, exposing every border tile to a
counter-attack. The threat check fixes that: in dangerous
neighborhoods we play tightly, but in soft ones we sprint. Net
effect should be Trinity-tier expansion when uncontested with
SlowAndSteady-tier survival under pressure.`,
  act(army, game) {
    if (army.strength < 2) return;
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.strength - 1) * ATTACKER_BONUS;

    let threatExists = false;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly) continue;
      if (enemy > 1) threatExists = true;
      let score;
      if (armies.length === 0) {
        score = 100;
      } else if (myEff > enemy) {
        score = 50 - enemy;
      } else {
        continue;
      }
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (threatExists) {
      // A stack adjacent could counter-attack: don't strand ourselves at 1.
      if (best) balanceAttack(army, best);
      else SlowAndSteady.act(army, game);
      return;
    }
    if (best) {
      army.attack(best, army.strength - 1);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
