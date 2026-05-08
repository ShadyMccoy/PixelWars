import { balanceAttack } from "./helpers.js";

export default {
  name: "Coward",
  author: "claude",
  version: 1,
  description: "Refuses any fight that's not a sure thing — only attacks empties or enemies it can crush at 2x.",
  summary: `Risk-averse to a fault. The standard "can I beat them with
margin 1" check is enough to win a duel but not enough to absorb a
late-arriving reinforcement on the same tick — Aggressive's
summary calls this exact failure mode out. Coward addresses it by
only committing to fights where enemyTotal * 2 + 1 < strength.
Anything closer than that is treated as a coin flip and declined.

Per army:
  1. Scan neighbors. If any neighbor enemy is *stronger* than us,
     we're potentially under threat — reinforce the friendliest
     adjacent tile (or stay put if no friendlies). No attack.
  2. Otherwise, prefer empty neighbors first (free territory, no
     trade). Use balanceAttack to commit just enough to hold.
  3. Then, qualifying enemies (2x margin). Same balanceAttack:
     send the minimum needed.
  4. Otherwise sit and grow.

Strength: nearly impossible to die by walking into a bad trade.
Pairs well with bots that need a defensive backline (Bully,
Conqueror lineage) — Coward holds the rear while they push.

Weakness: in a tournament where Borda scoring rewards survivors
weakly and territory leaders strongly, Coward's pacifism caps its
ceiling. Beats Hunter (which suicides into stacked tiles) but
loses to Settler (which compounds undisturbed because Coward
won't pressure it).`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let threatened = false;
    let bestEmpty = null;
    let bestEnemy = null;
    let bestEnemyScore = -Infinity;
    let friendliest = null;
    let friendliestCount = 0;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!bestEmpty) bestEmpty = t;
        continue;
      }
      let enemy = 0;
      let friendly = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly += 1;
        else enemy += a.strength;
      }
      if (friendly > 0 && enemy === 0) {
        if (friendly > friendliestCount) {
          friendliestCount = friendly;
          friendliest = t;
        }
        continue;
      }
      if (enemy >= army.strength) {
        threatened = true;
        continue;
      }
      if (enemy * 2 + 1 < army.strength) {
        const score = army.strength - enemy;
        if (score > bestEnemyScore) {
          bestEnemyScore = score;
          bestEnemy = t;
        }
      }
    }

    if (threatened) {
      if (friendliest && army.strength > 4) {
        army.attack(friendliest, army.strength * 0.5);
      }
      return;
    }
    if (bestEmpty) {
      balanceAttack(army, bestEmpty);
      return;
    }
    if (bestEnemy) {
      balanceAttack(army, bestEnemy);
      return;
    }
    if (friendliest && army.strength > army.maxStrength * 0.85) {
      army.attack(friendliest, army.strength * 0.5);
    }
  },
};
