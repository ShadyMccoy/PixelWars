// Painter — first example of the plan(game, player) bot API.
//
// Each tick:
//   1. If we have no active orders, issue one push order over our
//      whole territory toward the centroid of enemy strength.
//   2. Otherwise do nothing — the existing order's TTL ticks down on
//      its own and re-issues when it expires.
//
// This is deliberately the simplest possible plan-style bot: one
// order, refreshed when it expires. It demonstrates that a single
// declarative "push that way" intent can drive an entire army's
// behavior for many ticks without any per-army micromanagement.
// Better Painters will issue separate orders for different fronts,
// rotate intensity around the perimeter, etc. — but the floor is
// already this short.

const PUSH_TTL = 30;
const PUSH_INTENSITY = 0.85;

export default {
  name: "Painter",
  summary: "Plan-style push toward the enemy centroid.",
  description:
    "Issues one TTL-30 push order toward the centroid of enemy strength " +
    "whenever it has no active orders. Demonstrates the plan() API end to end.",
  tech: undefined,
  plan(game, player) {
    if (player.orders.length > 0) return;

    // Compute centroids of self-strength and enemy-strength. The
    // vector points from us to them; that's the direction we push.
    const armies = game.armies;
    let selfX = 0, selfY = 0, selfS = 0;
    let enemyX = 0, enemyY = 0, enemyS = 0;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive) continue;
      if (a.player.id === player.id) {
        selfX += a.pos.x * a.strength;
        selfY += a.pos.y * a.strength;
        selfS += a.strength;
      } else {
        enemyX += a.pos.x * a.strength;
        enemyY += a.pos.y * a.strength;
        enemyS += a.strength;
      }
    }
    if (selfS <= 0 || enemyS <= 0) return;
    selfX /= selfS; selfY /= selfS;
    enemyX /= enemyS; enemyY /= enemyS;

    // Wrap-aware shortest delta from self to enemy. The push vector
    // is the cardinal that best matches; the engine snaps each army
    // to a neighbor via dot product, so we don't need a unit vector.
    let dx = enemyX - selfX;
    let dy = enemyY - selfY;
    if (game.map.wrap) {
      const W = game.map.width;
      const H = game.map.height;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
    }
    if (dx === 0 && dy === 0) return;

    game.issueOrder(player, {
      region: { x: 0, y: 0, w: game.map.width, h: game.map.height },
      vector: { dx, dy },
      intensity: PUSH_INTENSITY,
      ttl: PUSH_TTL,
      commitment: "campaign",
    });
  },
};
