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

// Seed all players at once. Each player wants a `side × side` square of
// tiles centered on their start position; where those squares overlap
// (including via wrap), the tile goes to whichever seed is closest in
// torus-aware distance. This keeps overlap fair regardless of lineup
// order — without it, the player placed first claims the contested
// region and later players get carved-out blobs, biasing results
// toward whichever color sits at index 0.
//
// On evenly-spaced layouts an entire boundary column sits exactly
// equidistant from two seeds; the hash-based tiebreak below splits
// those ties roughly 50/50 per tile, instead of handing the whole
// column to the lower-indexed player.
function tieHash(playerIndex, x, y) {
  let h = (playerIndex * 2654435761) ^ (x * 73856093) ^ (y * 19349663);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export function placeStartingBlobs(game, players, positions, side) {
  if (players.length !== positions.length) {
    throw new Error(`placeStartingBlobs: ${players.length} players vs ${positions.length} positions`);
  }
  const map = game.map;
  const W = map.width;
  const H = map.height;
  const half = Math.floor(side / 2);
  const claim = new Map(); // tile -> { playerIndex, distSq, tieKey }
  for (let p = 0; p < players.length; p++) {
    const { x: cx, y: cy } = positions[p];
    for (let dy = 0; dy < side; dy++) {
      for (let dx = 0; dx < side; dx++) {
        const tx = cx + dx - half;
        const ty = cy + dy - half;
        const tile = map.getTile(tx, ty);
        if (!tile) continue;
        let ddx = Math.abs(tx - cx);
        let ddy = Math.abs(ty - cy);
        if (map.wrap) {
          ddx = Math.min(ddx, W - ddx);
          ddy = Math.min(ddy, H - ddy);
        }
        const distSq = ddx * ddx + ddy * ddy;
        const prev = claim.get(tile);
        if (!prev) {
          const tieKey = tieHash(p, tile.pos.x, tile.pos.y);
          claim.set(tile, { playerIndex: p, distSq, tieKey });
        } else if (distSq < prev.distSq) {
          const tieKey = tieHash(p, tile.pos.x, tile.pos.y);
          claim.set(tile, { playerIndex: p, distSq, tieKey });
        } else if (distSq === prev.distSq) {
          const tieKey = tieHash(p, tile.pos.x, tile.pos.y);
          if (tieKey < prev.tieKey) {
            claim.set(tile, { playerIndex: p, distSq, tieKey });
          }
        }
      }
    }
  }
  for (const [tile, { playerIndex }] of claim) {
    game.placeArmy({
      x: tile.pos.x,
      y: tile.pos.y,
      player: players[playerIndex],
      strength: STARTING_STRENGTH,
    });
  }
}
