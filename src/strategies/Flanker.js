import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Flanker",
  author: "claude",
  version: 1,
  description: "Prefers attacking enemy tiles already pincered by two or more friendly tiles.",
  summary: `Coordinated kills. Most bots evaluate a tile as if their army were
the only piece on the board; Flanker explicitly looks for tiles where the
*team* already has presence on multiple sides. An enemy with two friendly
neighbors is a kill that converts immediately into a thick three-friendly
cluster on the captured tile (since neighbors absorb), which is exactly
the local-density payoff Defender keeps trying to engineer at home.

Algorithm: for every adjacent enemy tile, count how many of *its* four
neighbors are tiles owned by us (i.e. tile.ownerId === pid). Tiles
with >=2 friendly neighbors are pincer targets and beat any non-pincer
choice; among pincers, prefer the weakest beatable enemy (Vampire-style
minimum-overkill). When no pincer move is available, fall back to
SlowAndSteady so we don't sit idle in our backfield.

Strength: punishes any opponent who lets a salient form. Weakness: on
sparse maps where players don't share long borders, pincer tiles never
appear and we degrade to SlowAndSteady.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.6) {
      SlowAndSteady.act(army, game);
      return;
    }

    let bestTile = null;
    let bestPincer = -1;
    let bestEnemy = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let enemy = 0;
      let friendlyHere = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendlyHere = true; break; }
        enemy += a.strength;
      }
      if (friendlyHere || enemy <= 0) continue;
      if (enemy + 1.1 > sLimit) continue;

      // Count how many of the target's neighbors are owned by us.
      // ownerId is the cleanest "do we hold this ground" signal —
      // armies move, ownership persists.
      let pincer = 0;
      const tn = t.neighbors;
      for (let k = 0; k < 4; k++) {
        const nb = tn[k];
        if (nb && nb.ownerId === pid) pincer++;
      }

      if (pincer > bestPincer || (pincer === bestPincer && enemy < bestEnemy)) {
        bestPincer = pincer;
        bestEnemy = enemy;
        bestTile = t;
      }
    }
    if (bestTile && bestPincer >= 2) {
      army.attack(bestTile, bestEnemy + 1);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
