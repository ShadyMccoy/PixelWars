// Player orders for the stratagem-driven bot API. On this branch a
// bot has NO per-army callback — its only influence on the world is
// the set of orders ("stratagems") it places on the map. Each tick
// the engine reads every player's active orders and derives tile/
// army behavior from them (see Game._expandOrders).
//
// Kinds:
//   'move': push intent. Armies on tiles inside the region advance
//     toward `vector`, committing `attackPower × intensity` per tick.
//   'wall': hold-and-attract. Armies inside the region don't push
//     out (any move intent is suppressed) and gain a defensive
//     multiplier from each covering wall's intensity. Friendly
//     armies outside the region but within pull radius are drawn
//     toward the nearest wall tile.
//
// Region grammar (first prototype): rectangles only.
//   region = { x, y, w, h }
//     (x, y) is the top-left, in tile coords. w/h are positive ints
//     (>= 1). On wrap maps the rect can straddle the seam: a cell
//     (cx, cy) is in-region iff ((cx - x + W) % W) < w and similarly
//     for y. On non-wrap maps a rect that extends past the map edge
//     simply has fewer covered cells than w*h.
//
// Vector: signed floats. Only consulted for 'move' orders; the engine
// snaps each per-army emission to the cardinal-neighbor that best
// aligns with the vector via dot product. Ignored for 'wall'.
//
// Intensity: 0..1. For 'move' it's the fraction of each affected
// army's attackPower committed per tick. For 'wall' it scales both
// the defensive bonus (defMult *= 1 + WALL_DEF_SCALE × intensity) and
// the pull strength on nearby friendly armies. Multiple orders
// covering the same army sum (clamped to 1.0) and their vectors
// weighted-average; wall pulls compose with move pushes the same way.
//
// TTL: integer ticks remaining. Decremented at end of Phase B. The
// order auto-expires when ttl hits 0. A "campaign" is just a higher
// TTL with the same shape.
//
// commitment: 'skirmish' | 'push' | 'campaign' | 'wall'. Currently
// informational only; the future bonus structure (defensive bumps,
// captured-tile growth) keys off this tag without changing the
// data shape.

let nextOrderId = 1;

// Tiles within this radius (Chebyshev distance to the rect boundary)
// are pulled toward a wall. Bigger walls don't pull from farther away
// — the radius is fixed so wall geometry alone determines its area of
// influence and adding a giant wall doesn't accidentally vacuum the
// whole map.
export const WALL_PULL_RADIUS = 5;

// Each unit of wall intensity covering an army's tile multiplies the
// army's defensive tech by this factor. intensity=1 wall → +50% def.
// Walls of the same player covering the same tile stack additively.
export const WALL_DEF_SCALE = 0.5;

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
  if (kind === "move") {
    if (!vector || !Number.isFinite(vector.dx) || !Number.isFinite(vector.dy)) {
      throw new Error("move Order requires vector {dx, dy}");
    }
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
    vector: vector ? { dx: vector.dx, dy: vector.dy } : { dx: 0, dy: 0 },
    intensity: clampedIntensity,
    ttl: clampedTtl,
    commitment,
    birthTick,
  };
}

// Wrap-aware Chebyshev "step delta from (cx, cy) toward the nearest
// tile inside `region`". Returns { dx, dy, dist }:
//   dx, dy : the per-axis distance into the rect, signed. (0, 0) when
//            (cx, cy) is already inside.
//   dist   : Chebyshev distance (max of |dx|, |dy|) — used by the wall
//            pull falloff so a tile right next to the wall is pulled
//            harder than one five tiles away.
export function nearestRectDelta(cx, cy, region, mapW, mapH) {
  const { x, y, w, h } = region;
  // Translate to the rect's local frame, taking the shortest wrap
  // path. local 0..w-1 is "inside on the x axis".
  let lx = cx - x;
  let ly = cy - y;
  if (mapW) {
    lx = ((lx % mapW) + mapW) % mapW;
    if (lx > mapW / 2) lx -= mapW;
  }
  if (mapH) {
    ly = ((ly % mapH) + mapH) % mapH;
    if (ly > mapH / 2) ly -= mapH;
  }
  let dx = 0;
  let dy = 0;
  if (lx < 0) dx = -lx;
  else if (lx >= w) dx = w - 1 - lx;
  if (ly < 0) dy = -ly;
  else if (ly >= h) dy = h - 1 - ly;
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  return { dx, dy, dist: adx > ady ? adx : ady };
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
