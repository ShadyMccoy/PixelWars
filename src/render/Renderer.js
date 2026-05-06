export class Renderer {
  constructor({ canvas, game }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.tileSize = 0;
    this.showGrid = true;
    this.showTerritory = true;
    this.showGlow = true;
    this.showMoves = true;
    this.showOverlay = false;
    this.hoverTile = null;
    this.selectedTile = null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setGame(game) {
    this.game = game;
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const map = this.game.map;
    const aspect = map.width / map.height;
    let w = rect.width;
    let h = rect.width / aspect;
    if (h > rect.height) {
      h = rect.height;
      w = rect.height * aspect;
    }
    this.cssWidth = Math.floor(w);
    this.cssHeight = Math.floor(h);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
    this.canvas.width = Math.floor(this.cssWidth * this.dpr);
    this.canvas.height = Math.floor(this.cssHeight * this.dpr);
    this.tileSize = (this.cssWidth / map.width) * this.dpr;
  }

  pixelToTile(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((px - rect.left) / rect.width) * this.game.map.width);
    const y = Math.floor(((py - rect.top) / rect.height) * this.game.map.height);
    return this.game.map.getTile(x, y);
  }

  draw(now) {
    const ctx = this.ctx;
    const game = this.game;
    const ts = this.tileSize;

    ctx.fillStyle = "#06080d";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.showTerritory) this.drawTerritory();

    if (this.showGrid && game.map.width <= 80) {
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= game.map.width; x++) {
        ctx.moveTo(x * ts, 0);
        ctx.lineTo(x * ts, game.map.height * ts);
      }
      for (let y = 0; y <= game.map.height; y++) {
        ctx.moveTo(0, y * ts);
        ctx.lineTo(game.map.width * ts, y * ts);
      }
      ctx.stroke();
    }

    if (this.showMoves) this.drawMoves();

    this.drawArmies(now);

    if (this.showOverlay) this.drawStrategyOverlay();

    if (this.hoverTile) this.outlineTile(this.hoverTile, "rgba(255,255,255,0.35)", 2);
    if (this.selectedTile) this.outlineTile(this.selectedTile, "#ffffff", 3);
  }

  drawTerritory() {
    const ctx = this.ctx;
    const ts = this.tileSize;
    for (const tile of this.game.map.tiles) {
      const owner = tile.ownerArmy();
      if (!owner) continue;
      const alpha = 0.10 + 0.20 * (owner.strength / owner.maxStrength);
      ctx.fillStyle = hexToRgba(owner.player.color, alpha);
      ctx.fillRect(tile.pos.x * ts, tile.pos.y * ts, ts, ts);
    }
  }

  drawMoves() {
    const ctx = this.ctx;
    const ts = this.tileSize;
    const game = this.game;
    const moves = game.recentMoves;
    if (!moves || moves.length === 0) return;
    const fade = game.moveFadeTicks || 8;
    const tick = game.tick;
    const lineWidth = Math.max(1, ts * 0.09);
    const headLen = ts * 0.22;
    ctx.lineCap = "round";
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const age = tick - m.tick;
      if (age >= fade || age < 0) continue;
      const alpha = (1 - age / fade) * 0.6;
      const sx = (m.x + 0.5) * ts;
      const sy = (m.y + 0.5) * ts;
      const tx = (m.x + 0.5 + m.dx) * ts;
      const ty = (m.y + 0.5 + m.dy) * ts;
      // Comet-style taper: transparent at the origin, full accent at the
      // destination. The gradient itself encodes direction, so a westbound
      // and an eastbound move are never mirror images of each other.
      const grad = ctx.createLinearGradient(sx, sy, tx, ty);
      grad.addColorStop(0, hexToRgba(m.accent, 0));
      grad.addColorStop(0.6, hexToRgba(m.accent, alpha * 0.5));
      grad.addColorStop(1, hexToRgba(m.accent, alpha));
      ctx.strokeStyle = grad;
      ctx.fillStyle = hexToRgba(m.accent, alpha);
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      const ang = Math.atan2(ty - sy, tx - sx);
      const back = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(ang + back) * headLen, ty + Math.sin(ang + back) * headLen);
      ctx.lineTo(tx + Math.cos(ang - back) * headLen, ty + Math.sin(ang - back) * headLen);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawArmies(now) {
    const ctx = this.ctx;
    const ts = this.tileSize;
    // Radius scales as ratio^0.7 — between area-linear (sqrt) and
    // diameter-linear (linear). A 10x strength change yields ~3x
    // diameter / ~9x area, big enough to read at a glance without
    // making weak armies invisible.
    const minRadius = 0.08;
    const maxRadius = 0.46;
    const exponent = 0.7;
    for (const army of this.game.armies) {
      if (!army.alive) continue;
      if (!army.bornAt) army.bornAt = now;
      const ratio = Math.max(0, Math.min(1, army.strength / army.maxStrength));
      const radiusFactor = minRadius + (maxRadius - minRadius) * Math.pow(ratio, exponent);
      const cx = (army.pos.x + 0.5) * ts;
      const cy = (army.pos.y + 0.5) * ts;
      const age = (now - army.bornAt) / 1000;
      const pulse = 1 + Math.sin(age * 4 + army.id) * 0.04;
      const drawRadius = ts * radiusFactor * pulse;

      if (this.showGlow) {
        const glowR = drawRadius * 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        grad.addColorStop(0, hexToRgba(army.player.accent, 0.85));
        grad.addColorStop(1, hexToRgba(army.player.color, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
      }

      ctx.fillStyle = army.player.color;
      ctx.beginPath();
      ctx.arc(cx, cy, drawRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = army.player.accent;
      ctx.lineWidth = Math.max(1, ts * 0.04);
      ctx.stroke();
    }
  }

  // Sparse strategic overlay. For every player whose strategy paints a
  // plan into game[`_<bot>Plan_<pid>`], draw a small marker on
  // exceptional roles (SINK = hold, SORTIE = attack lance) and a faint
  // flow tick on interior tiles within 2 steps of a front. The default
  // FRONT/INTERIOR roles get nothing — the territory tint already
  // shows ownership; we only mark what the painter has decided is
  // *unusual*.
  drawStrategyOverlay() {
    const ctx = this.ctx;
    const game = this.game;
    const map = game.map;
    const ts = this.tileSize;
    const tick = game.tick;

    const PLAN_KEYS = ["_frontierPlan_", "_pressureSinkPlan_", "_citadelSortiePlan_"];

    // ROLE_SINK = 3, ROLE_SORTIE = 4 (mirroring painter.js codes —
    // duplicated as constants here so the renderer doesn't need to
    // import strategy code).
    const ROLE_SINK = 3;
    const ROLE_SORTIE = 4;

    for (const player of game.players.list) {
      let plan = null;
      for (const prefix of PLAN_KEYS) {
        const cached = game[`${prefix}${player.id}`];
        if (cached && cached.tick === tick) { plan = cached.plan; break; }
      }
      if (!plan) continue;

      const accent = player.accent;
      const roles = plan.roles;
      const depth = plan.depth;
      const friendly = plan.friendly;
      const w = map.width;
      const tiles = map.tiles;

      ctx.save();
      ctx.lineWidth = Math.max(1, ts * 0.06);

      for (let i = 0; i < tiles.length; i++) {
        const role = roles[i];
        const t = tiles[i];
        const cx = (t.pos.x + 0.5) * ts;
        const cy = (t.pos.y + 0.5) * ts;

        if (role === ROLE_SINK) {
          // Small inward-pointing chevron at the tile's outward edge —
          // reads as a shield mark. Use a desaturated tone so it
          // doesn't compete with the territory tint.
          ctx.strokeStyle = "rgba(255,200,120,0.55)";
          const r = ts * 0.18;
          ctx.beginPath();
          ctx.moveTo(cx - r, cy + r * 0.6);
          ctx.lineTo(cx, cy - r * 0.4);
          ctx.lineTo(cx + r, cy + r * 0.6);
          ctx.stroke();
        } else if (role === ROLE_SORTIE) {
          // Outward-pointing chevron in player accent. Direction =
          // average vector to non-friendly neighbors.
          let dx = 0, dy = 0, n = 0;
          const nbs = t.neighbors;
          for (let k = 0; k < 4; k++) {
            const nb = nbs[k];
            if (!nb) continue;
            const ni = nb.pos.y * w + nb.pos.x;
            if (friendly[ni]) continue;
            dx += nb.pos.x - t.pos.x;
            dy += nb.pos.y - t.pos.y;
            n++;
          }
          if (n === 0) continue;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          const r = ts * 0.28;
          // Tip at the outward edge, two wings behind.
          const tipX = cx + dx * r;
          const tipY = cy + dy * r;
          const baseX = cx - dx * r * 0.4;
          const baseY = cy - dy * r * 0.4;
          // Perpendicular for wings.
          const perpX = -dy;
          const perpY = dx;
          const wingR = r * 0.7;
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1.5, ts * 0.08);
          ctx.beginPath();
          ctx.moveTo(baseX + perpX * wingR, baseY + perpY * wingR);
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(baseX - perpX * wingR, baseY - perpY * wingR);
          ctx.stroke();
          ctx.lineWidth = Math.max(1, ts * 0.06);
        } else if (depth && depth[i] >= 1 && depth[i] <= 2) {
          // Faint flow tick: short line from tile center toward the
          // friendly neighbor with the lowest BFS depth. Only drawn
          // for tiles at depth 1–2 (just behind the front), so a big
          // territory doesn't fill with arrows.
          let bestDx = 0, bestDy = 0, bestDepth = depth[i];
          const nbs = t.neighbors;
          for (let k = 0; k < 4; k++) {
            const nb = nbs[k];
            if (!nb) continue;
            const ni = nb.pos.y * w + nb.pos.x;
            if (!friendly[ni]) continue;
            const d = depth[ni];
            if (d < 0) continue;
            if (d < bestDepth) {
              bestDepth = d;
              bestDx = nb.pos.x - t.pos.x;
              bestDy = nb.pos.y - t.pos.y;
            }
          }
          if (bestDx === 0 && bestDy === 0) continue;
          const r = ts * 0.22;
          ctx.strokeStyle = hexToRgba(accent, 0.35);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + bestDx * r, cy + bestDy * r);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  outlineTile(tile, color, width) {
    const ctx = this.ctx;
    const ts = this.tileSize;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(
      tile.pos.x * ts + width / 2,
      tile.pos.y * ts + width / 2,
      ts - width,
      ts - width
    );
  }
}

export function hexToRgba(hex, a) {
  const m = hex.replace("#", "");
  const bigint = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
}
