// Fortress — plan-style bot that plants a defensive wall around its
// starting hub and pushes outward toward the enemy centroid.
//
// Strategy:
//   1. On first plan() call, find our strongest army's tile and place
//      a 3×3 wall centered on it with a long TTL. Stays put for the
//      whole match; armies inside it get a defensive bonus and units
//      within pull radius drift in to man it.
//   2. Always keep one push order alive toward the enemy centroid,
//      same shape as Painter but with lower intensity so the wall
//      pull doesn't immediately empty out.
//
// Whole behavior is two orders: a wall + a push. Demonstrates the
// "no per-army callback at all" promise — Fortress never references
// individual armies; the engine derives everything from the two
// stratagems.

const PUSH_TTL = 30;
const PUSH_INTENSITY = 0.55;
const WALL_TTL = 9999;       // effectively permanent until cancelled
const WALL_INTENSITY = 0.9;
const WALL_HALF = 1;         // 3×3 wall: 2*halfsize + 1

export default {
  name: "Fortress",
  summary: "Wall around the capital plus a steady push toward the enemy.",
  description:
    "Plants one wall stratagem on its starting hub for defensive bonuses + " +
    "pull, plus a recurring TTL-30 push order toward the enemy centroid. " +
    "Two orders total — no per-army micromanagement.",
  tech: undefined,
  plan(game, player) {
    const hasWall = player.orders.some((o) => o.kind === "wall");
    const hasPush = player.orders.some((o) => o.kind === "move");

    if (!hasWall) {
      const hub = pickHub(game, player);
      if (hub) {
        game.issueOrder(player, {
          kind: "wall",
          region: {
            x: hub.x - WALL_HALF,
            y: hub.y - WALL_HALF,
            w: WALL_HALF * 2 + 1,
            h: WALL_HALF * 2 + 1,
          },
          intensity: WALL_INTENSITY,
          ttl: WALL_TTL,
          commitment: "wall",
        });
      }
    }

    if (!hasPush) {
      const v = enemyCentroidVector(game, player);
      if (v) {
        game.issueOrder(player, {
          kind: "move",
          region: { x: 0, y: 0, w: game.map.width, h: game.map.height },
          vector: v,
          intensity: PUSH_INTENSITY,
          ttl: PUSH_TTL,
          commitment: "campaign",
        });
      }
    }
  },
};

// Pick the army-strength centroid of the player as the hub. Anchors
// the wall to wherever the bulk of forces sits at first decision.
function pickHub(game, player) {
  const armies = game.armies;
  let sx = 0, sy = 0, ss = 0;
  for (let i = 0; i < armies.length; i++) {
    const a = armies[i];
    if (!a.alive || a.player.id !== player.id) continue;
    sx += a.pos.x * a.strength;
    sy += a.pos.y * a.strength;
    ss += a.strength;
  }
  if (ss <= 0) return null;
  return { x: Math.round(sx / ss), y: Math.round(sy / ss) };
}

function enemyCentroidVector(game, player) {
  const armies = game.armies;
  let mx = 0, my = 0, ms = 0;
  let ex = 0, ey = 0, es = 0;
  for (let i = 0; i < armies.length; i++) {
    const a = armies[i];
    if (!a.alive) continue;
    if (a.player.id === player.id) {
      mx += a.pos.x * a.strength;
      my += a.pos.y * a.strength;
      ms += a.strength;
    } else {
      ex += a.pos.x * a.strength;
      ey += a.pos.y * a.strength;
      es += a.strength;
    }
  }
  if (ms <= 0 || es <= 0) return null;
  let dx = ex / es - mx / ms;
  let dy = ey / es - my / ms;
  if (game.map.wrap) {
    const W = game.map.width;
    const H = game.map.height;
    if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
    if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
  }
  if (dx === 0 && dy === 0) return null;
  return { dx, dy };
}
