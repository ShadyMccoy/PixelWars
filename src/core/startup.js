// Shared helper for seeding starting territory. Each player gets a
// square blob of tiles centered on their starting position, sized so
// all blobs together cover roughly half the map. Compresses the
// empty-board phase so combat techs (atk/def) matter from tick one
// instead of waiting for expansion to fill the map.

const STARTING_STRENGTH = 2;
const COVERAGE_TARGET = 0.5;

export function startingBlobSide(map, playerCount) {
  const totalTiles = map.width * map.height;
  const perPlayer = Math.max(1, Math.floor(totalTiles * COVERAGE_TARGET / playerCount));
  return Math.max(1, Math.round(Math.sqrt(perPlayer)));
}

// Seed a player's starting blob centered on (cx, cy). First-come-
// first-served on overlap: tiles already claimed by another player
// are left alone rather than producing a contested start.
export function placeStartingBlob(game, player, cx, cy, side) {
  const half = Math.floor(side / 2);
  for (let dy = 0; dy < side; dy++) {
    for (let dx = 0; dx < side; dx++) {
      const x = cx + dx - half;
      const y = cy + dy - half;
      const tile = game.map.getTile(x, y);
      if (!tile) continue;
      if (tile.armies.length > 0 && tile.armies[0].player.id !== player.id) continue;
      game.placeArmy({ x, y, player, strength: STARTING_STRENGTH });
    }
  }
}
