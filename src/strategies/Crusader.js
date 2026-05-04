import SlowAndSteady from "./SlowAndSteady.js";

const BONUS = 1.4;

// Engine attackerBonus is 1.4. To kill an enemy stack of E, an attacker only
// needs strength S such that S * 1.4 > E. Most existing bots — including
// Vampire (sends E+1) and Aggressive (sends s-1) — over-commit on soft
// targets. Crusader exploits the bonus on every enemy commit, then pushes
// hard into empty space when there's nothing to kill.
export default {
  name: "Crusader",
  author: "claude",
  version: 1,
  description: "Minimum-overkill kills (1.4x bonus aware), aggressive empty-tile expansion otherwise.",
  summary: `Vampire-style minimum-overkill, but calibrated to the engine's 1.4x
attacker bonus: a P-strength attack effectively fights as 1.4 P, so we
only need ceil(E/1.4 + 0.6) to win cleanly. The home tile keeps ~30%
more strength than Vampire and that surplus is reinvested. When no enemy
is beatable, we fall through to a strong expansion: hit the weakest
adjacent enemy if we still can, otherwise grab an empty tile with
strength-1, otherwise SlowAndSteady reinforce. The thesis is that
minimum-overkill is only worthwhile if you actually spend the saved
strength elsewhere — so the fallbacks are tuned to keep the army
moving instead of standing pat.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.strength - 1;
    if (sLimit <= 0.5) return;

    // Pass 1: pick the weakest beatable enemy (min-overkill the kill).
    let killTile = null;
    let killPower = 0;
    let killEnemy = Infinity;
    let emptyTile = null;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!emptyTile) emptyTile = t;
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly = true;
        else enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemy < killEnemy) {
        killEnemy = enemy;
        killTile = t;
        killPower = needed;
      }
    }
    if (killTile) {
      army.attack(killTile, killPower);
      return;
    }
    // Empty tile expansion: send the whole army (minus 1) to plant a strong
    // forward base. Beats SlowAndSteady's half-measures into empties.
    if (emptyTile) {
      army.attack(emptyTile, sLimit);
      return;
    }
    // No kill, no empty: thicken via balanced reinforcement.
    SlowAndSteady.act(army, game);
  },
};
