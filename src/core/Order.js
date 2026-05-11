// Player orders for the bot-command overhaul. An Order is a multi-tick
// intent the bot pins to a region of the map: "push my armies in this
// rectangle in this direction with this intensity for N ticks". The
// engine expands orders into per-army _pendingMoves entries each tick
// (see Game._expandOrders), so a single Order can drive dozens of
// armies for its entire TTL without the bot having to re-issue or
// micromanage. This is what replaces the old per-army-per-tick act()
// firehose.
//
// Region grammar (first prototype): rectangles only.
//   region = { x, y, w, h }
//     (x, y) is the top-left, in tile coords. w/h are positive ints
//     (>= 1). On wrap maps the rect can straddle the seam: a cell
//     (cx, cy) is in-region iff ((cx - x + W) % W) < w and similarly
//     for y. On non-wrap maps a rect that extends past the map edge
//     simply has fewer covered cells than w*h.
//
// Vector: signed floats. The engine snaps each per-army emission to
// the cardinal-neighbor (or any reachable tile in budget mode) that
// best aligns with the vector via dot product.
//
// Intensity: 0..1. Fraction of each affected army's attackPower
// committed per tick. Multiple orders covering the same army sum
// (clamped to 1.0), and their vectors weighted-average — see
// Game._expandOrders.
//
// TTL: integer ticks remaining. Decremented at end of Phase B′. The
// order auto-expires when ttl hits 0. A "campaign" is just a higher
// TTL with the same shape.
//
// commitment: 'skirmish' | 'push' | 'campaign'. Currently informational
// only; the future bonus structure (defensive bumps, captured-tile
// growth) keys off this tag without changing the data shape.

let nextOrderId = 1;

export function makeOrder({
  playerId,
  kind = "move",
  region,
  vector,
  intensity = 1.0,
  ttl = 1,
  commitment = "skirmish",
  birthTick = 0,
  id = null,
} = {}) {
  if (!region || !Number.isFinite(region.x) || !Number.isFinite(region.y)) {
    throw new Error("Order.region requires {x, y, w, h}");
  }
  if (!vector || !Number.isFinite(vector.dx) || !Number.isFinite(vector.dy)) {
    throw new Error("Order.vector requires {dx, dy}");
  }
  const w = Math.max(1, Math.floor(region.w ?? 1));
  const h = Math.max(1, Math.floor(region.h ?? 1));
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  const clampedTtl = Math.max(1, Math.floor(ttl));
  return {
    id: id != null ? id : nextOrderId++,
    playerId,
    kind,
    region: { x: Math.floor(region.x), y: Math.floor(region.y), w, h },
    vector: { dx: vector.dx, dy: vector.dy },
    intensity: clampedIntensity,
    ttl: clampedTtl,
    commitment,
    birthTick,
  };
}

// Cell-in-rectangle test that handles wrap. mapW/mapH are required
// only when the source rect needs to wrap (engine always passes them
// in to stay correct on globe maps).
export function cellInRegion(cx, cy, region, mapW, mapH) {
  const { x, y, w, h } = region;
  let dx, dy;
  if (mapW) {
    dx = ((cx - x) % mapW + mapW) % mapW;
  } else {
    dx = cx - x;
    if (dx < 0) return false;
  }
  if (mapH) {
    dy = ((cy - y) % mapH + mapH) % mapH;
  } else {
    dy = cy - y;
    if (dy < 0) return false;
  }
  return dx < w && dy < h;
}

// Pick the cardinal-neighbor (dx, dy) ∈ {(1,0),(-1,0),(0,1),(0,-1)} of
// the army's tile that best aligns with the order vector. On a tie we
// prefer the axis-dominant direction; ties of equal length get split
// by a seeded rng so the snapped direction is deterministic per match
// but not biased toward any axis.
export function pickCardinal(vec, rng) {
  const dx = vec.dx;
  const dy = vec.dy;
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX > absY) return { dx: dx > 0 ? 1 : -1, dy: 0 };
  if (absY > absX) return { dx: 0, dy: dy > 0 ? 1 : -1 };
  // Equal-magnitude diagonal: coin-flip the axis.
  const r = rng ? rng() : 0.5;
  if (r < 0.5) return { dx: dx > 0 ? 1 : -1, dy: 0 };
  return { dx: 0, dy: dy > 0 ? 1 : -1 };
}
