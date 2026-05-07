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
    // Viewport: zoom = 1 fits the map exactly to the canvas; panX/panY
    // are in tile units (fractional) and on wrap maps are normalized
    // into [0, map.width) × [0, map.height). The draw path applies
    // these as a context transform and tile-replicates wrap maps so
    // scrolling past the seam reveals the next copy.
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.5;
    this.maxZoom = 16;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setGame(game) {
    this.game = game;
    this.resetView();
    this.resize();
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
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
    this._clampPan();
  }

  pixelToTile(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ix = ((px - rect.left) / rect.width) * this.canvas.width;
    const iy = ((py - rect.top) / rect.height) * this.canvas.height;
    const ts = this.tileSize;
    const tx = Math.floor((ix / this.zoom) / ts + this.panX);
    const ty = Math.floor((iy / this.zoom) / ts + this.panY);
    return this.game.map.getTile(tx, ty);
  }

  // Zoom toward the cursor: the world point under (cssX, cssY) stays
  // fixed across the zoom step. Without this anchoring, wheel-zoom
  // drifts the focus and forces users to pan back after every scroll.
  zoomAt(cssX, cssY, factor) {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    if (newZoom === this.zoom) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ix = ((cssX - rect.left) / rect.width) * this.canvas.width;
    const iy = ((cssY - rect.top) / rect.height) * this.canvas.height;
    const ts = this.tileSize;
    const cursorTileX = ix / (this.zoom * ts) + this.panX;
    const cursorTileY = iy / (this.zoom * ts) + this.panY;
    this.zoom = newZoom;
    this.panX = cursorTileX - ix / (this.zoom * ts);
    this.panY = cursorTileY - iy / (this.zoom * ts);
    this._clampPan();
  }

  // Pan by a CSS-pixel delta (e.g., from a drag). Converts to tile
  // units via the current zoom so a 100px drag at zoom=2 moves half as
  // far across the map as the same drag at zoom=1.
  panByPixels(dx, dy) {
    if (this.cssWidth === 0 || this.cssHeight === 0) return;
    const map = this.game.map;
    const dxTiles = (dx / this.cssWidth) * (map.width / this.zoom);
    const dyTiles = (dy / this.cssHeight) * (map.height / this.zoom);
    this.panX -= dxTiles;
    this.panY -= dyTiles;
    this._clampPan();
  }

  _clampPan() {
    const map = this.game.map;
    if (map.wrap) {
      // Globe-style wrap: normalize into one canonical period so float
      // accumulation can't drift unboundedly across long sessions.
      this.panX = ((this.panX % map.width) + map.width) % map.width;
      this.panY = ((this.panY % map.height) + map.height) % map.height;
    } else {
      const visTilesX = map.width / this.zoom;
      const visTilesY = map.height / this.zoom;
      // If the view is bigger than the map (zoom < 1), center it
      // rather than letting the user push the map off-screen.
      if (visTilesX >= map.width) {
        this.panX = (map.width - visTilesX) / 2;
      } else {
        this.panX = Math.max(0, Math.min(map.width - visTilesX, this.panX));
      }
      if (visTilesY >= map.height) {
        this.panY = (map.height - visTilesY) / 2;
      } else {
        this.panY = Math.max(0, Math.min(map.height - visTilesY, this.panY));
      }
    }
  }

  draw(now) {
    const ctx = this.ctx;
    const map = this.game.map;
    const ts = this.tileSize;
    const z = this.zoom;

    ctx.fillStyle = "#06080d";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const mapPxW = map.width * ts;
    const mapPxH = map.height * ts;
    const visW = this.canvas.width / z;
    const visH = this.canvas.height / z;

    ctx.save();
    ctx.scale(z, z);

    if (map.wrap) {
      // panX/panY were normalized into [0, map) by _clampPan, so the
      // first copy starts at a non-positive offset and we tile forward
      // until the visible region is covered. For a fit view (zoom=1,
      // panX=0) this collapses to a single copy.
      const startX = -this.panX * ts;
      const startY = -this.panY * ts;
      const copiesX = Math.max(1, Math.ceil((visW - startX) / mapPxW));
      const copiesY = Math.max(1, Math.ceil((visH - startY) / mapPxH));
      for (let cy = 0; cy < copiesY; cy++) {
        for (let cx = 0; cx < copiesX; cx++) {
          ctx.save();
          ctx.translate(startX + cx * mapPxW, startY + cy * mapPxH);
          this._drawWorld(now);
          ctx.restore();
        }
      }
    } else {
      ctx.translate(-this.panX * ts, -this.panY * ts);
      this._drawWorld(now);
    }

    ctx.restore();
  }

  _drawWorld(now) {
    const ctx = this.ctx;
    const game = this.game;
    const ts = this.tileSize;
    const z = this.zoom;

    if (this.showTerritory) this.drawTerritory();

    if (this.showGrid && game.map.width <= 80) {
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      // Compensate for the active scale so the grid stays a hairline
      // regardless of zoom — at zoom=4 a literal 1-unit line would be
      // 4 device pixels wide and the territory tint would disappear
      // behind it.
      ctx.lineWidth = 1 / z;
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

    if (this.hoverTile) this.outlineTile(this.hoverTile, "rgba(255,255,255,0.35)", 2 / z);
    if (this.selectedTile) this.outlineTile(this.selectedTile, "#ffffff", 3 / z);
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
          // Inward-pointing chevron at the tile's outward edge — reads
          // as a shield mark. Drawn twice: a dark base for contrast on
          // bright territory, then the bright orange pip on top.
          const r = ts * 0.22;
          ctx.beginPath();
          ctx.moveTo(cx - r, cy + r * 0.6);
          ctx.lineTo(cx, cy - r * 0.4);
          ctx.lineTo(cx + r, cy + r * 0.6);
          ctx.lineWidth = Math.max(2, ts * 0.12);
          ctx.strokeStyle = "rgba(0,0,0,0.55)";
          ctx.stroke();
          ctx.lineWidth = Math.max(1.5, ts * 0.08);
          ctx.strokeStyle = "rgba(255,200,120,0.95)";
          ctx.stroke();
          ctx.lineWidth = Math.max(1, ts * 0.06);
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
