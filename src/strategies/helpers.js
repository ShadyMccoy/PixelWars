import { totalStrength } from "../core/Army.js";

export function balanceAttack(army, tile) {
  const armies = tile.armies;
  if (armies.length > 0 && armies[0].player.id === army.player.id) {
    const enemyStrength = totalStrength(armies);
    army.attack(tile, army.strength - (army.strength + enemyStrength) / 2);
    return;
  }
  const enemy = totalStrength(armies);
  if (enemy + 1 < army.strength) {
    army.attack(tile, army.strength - 1);
  }
}
