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
    this.showConflicts = true;
    this.showOverlay = false;
    this.showOrders = true;
    // "circle" | "line": visual used to depict an in-flight move.
    this.moveStyle = "circle";
    // 3D iso view: each tile becomes a colored prism whose height is
    // the strength of the owning army. Reads like a stylized Voronoi
    // diagram in three dimensions. Disabled by default; toggled from
    // the View panel.
    this.view3D = false;
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
    // zoom=1 already fits the map exactly; zooming out further would
    // either reveal empty space (non-wrap) or duplicate the world via
    // tile-replication (wrap), neither of which adds information.
    this.minZoom = 1;
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
    if (this.view3D) {
      // Inverse iso projection at z=0. Picking ignores column height
      // (a click on a tall pillar's top maps to the cell behind it),
      // but the territory still reads correctly on the ground plane.
      const layout = this._iso3DLayout();
      if (!layout) return null;
      const { cx, cy, ts } = layout;
      const dx = ix - cx;
      const dy = iy - cy;
      const tx = Math.floor(dx / ts + 2 * dy / ts);
      const ty = Math.floor(2 * dy / ts - dx / ts);
      return this.game.map.getTile(tx, ty);
    }
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
    if (this.view3D) {
      // The iso projection has its own bbox-centered origin; the 2D
      // wrap/strict clamps would either teleport the camera (wrap) or
      // pin pan to zero (non-wrap fit). Allow a generous free-pan
      // range in tile units instead.
      const limit = (map.width + map.height);
      this.panX = Math.max(-limit, Math.min(limit, this.panX));
      this.panY = Math.max(-limit, Math.min(limit, this.panY));
      return;
    }
    if (map.wrap) {
      // Globe-style wrap: normalize into one canonical period so float
      // accumulation can't drift unboundedly across long sessions.
      this.panX = ((this.panX % map.width) + map.width) % map.width;
      this.panY = ((this.panY % map.height) + map.height) % map.height;
    } else {
      const visTilesX = map.width / this.zoom;
      const visTilesY = map.height / this.zoom;
      this.panX = Math.max(0, Math.min(map.width - visTilesX, this.panX));
      this.panY = Math.max(0, Math.min(map.height - visTilesY, this.panY));
    }
  }

  draw(now) {
    const ctx = this.ctx;
    const map = this.game.map;
    const ts = this.tileSize;
    const z = this.zoom;

    ctx.fillStyle = "#06080d";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.view3D) {
      this._draw3D(now);
      return;
    }

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

    if (this.showConflicts) this.drawConflicts();

    if (this.showMoves) this.drawMoves();

    if (this.showOrders) this.drawOrders();

    this.drawArmies(now);

    if (this.showOverlay) this.drawStrategyOverlay();

    if (this.hoverTile) this.outlineTile(this.hoverTile, "rgba(255,255,255,0.35)", 2 / z);
    if (this.selectedTile) this.outlineTile(this.selectedTile, "#ffffff", 3 / z);
  }

  drawTerritory() {
    const ctx = this.ctx;
    const ts = this.tileSize;
    for (const tile of this.game.map.tiles) {
      const armies = tile.armies;
      const n = armies.length;
      if (n === 0) continue;
      const holder = tile.ownerArmy();
      const x = tile.pos.x * ts;
      const y = tile.pos.y * ts;
      // Holder base tint: matches the historical look. Holder may be
      // null when the tile is in flux (contested with no prior holder,
      // or the prior holder just died and multiple challengers remain)
      // — in that case the base layer stays bare and only the marbled
      // pips below paint, reading as a neutral-gray contested tile.
      if (holder && holder.player) {
        const alpha = 0.10 + 0.20 * (holder.strength / holder.maxStrength);
        ctx.fillStyle = hexToRgba(holder.player.color, alpha);
        ctx.fillRect(x, y, ts, ts);
      }
      if (n === 1) continue;
      // Contested tile: paint each non-holder occupant as a concentric
      // square whose size scales with their share of total strength on
      // the tile. A near-50/50 brackish tile draws a big inner square;
      // a near-cleared minority shrinks to a small central pip.
      let total = 0;
      for (let i = 0; i < n; i++) total += armies[i].strength;
      if (total <= 0) continue;
      const sorted = armies.slice().sort((a, b) => a.strength - b.strength);
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        if (!a.player) continue;
        if (a === holder) continue;
        const share = a.strength / total;
        const inset = ts * 0.5 * (1 - Math.sqrt(Math.min(1, 2 * share)));
        const innerSize = ts - inset * 2;
        if (innerSize <= 0) continue;
        const alpha = 0.18 + 0.25 * share;
        ctx.fillStyle = hexToRgba(a.player.color, alpha);
        ctx.fillRect(x + inset, y + inset, innerSize, innerSize);
      }
    }
  }

  // Faint red residue on tiles where combat just resolved. Each
  // recorded conflict paints a square whose alpha fades linearly to
  // zero over conflictFadeTicks and scales with the strength engaged
  // in that fight; overlapping conflicts compound via alpha blending,
  // so a tile under sustained attack stays visibly red.
  drawConflicts() {
    const ctx = this.ctx;
    const ts = this.tileSize;
    const game = this.game;
    const conflicts = game.recentConflicts;
    if (!conflicts || conflicts.length === 0) return;
    const fade = game.conflictFadeTicks || 30;
    const tick = game.tick;
    // A two-army max-strength clash is the natural saturation point;
    // above that the alpha cap takes over.
    const refMagnitude = Math.max(1, (game.maxArmy || 6) * 2);
    const maxAlpha = 0.55;
    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      const age = tick - c.tick;
      if (age >= fade || age < 0) continue;
      const ageFactor = 1 - age / fade;
      const sizeFactor = Math.min(1, c.magnitude / refMagnitude);
      const alpha = maxAlpha * ageFactor * sizeFactor;
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(220,40,40,${alpha})`;
      ctx.fillRect(c.x * ts, c.y * ts, ts, ts);
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
    // Same shape exponent as drawArmies so the size of the moving shape
    // visually matches the size of the army that produced the move.
    const refStrength = game.maxArmy || 6;
    const minSize = 0.10;
    const maxSize = 0.42;
    const exponent = 0.7;
    const denom = Math.max(1, fade - 1);
    ctx.lineCap = "round";
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const age = tick - m.tick;
      if (age >= fade || age < 0) continue;
      const t = Math.min(1, age / denom);
      const alpha = Math.max(0, 1 - age / fade) * 0.85;
      const cx = (m.x + 0.5 + m.dx * t) * ts;
      const cy = (m.y + 0.5 + m.dy * t) * ts;
      const ratio = Math.max(0, Math.min(1, m.power / refStrength));
      const size = ts * (minSize + (maxSize - minSize) * Math.pow(ratio, exponent));

      if (this.moveStyle === "line") {
        // Bar oriented perpendicular to the path, sliding from source
        // to destination. Half-length scales with the move's strength.
        const len = Math.hypot(m.dx, m.dy) || 1;
        const nx = -m.dy / len;
        const ny = m.dx / len;
        const half = size * 1.15;
        ctx.strokeStyle = hexToRgba(m.accent, alpha);
        ctx.lineWidth = Math.max(2, ts * 0.12);
        ctx.beginPath();
        ctx.moveTo(cx - nx * half, cy - ny * half);
        ctx.lineTo(cx + nx * half, cy + ny * half);
        ctx.stroke();
      } else {
        // Filled circle in the player's color with an accent ring;
        // radius scales with the move's strength.
        ctx.fillStyle = hexToRgba(m.color, alpha);
        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(m.accent, alpha);
        ctx.lineWidth = Math.max(1, ts * 0.05);
        ctx.stroke();
      }
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
      if (!army.player) continue;
      if (!army.bornAt) army.bornAt = now;
      const ratio = Math.max(0, Math.min(1, army.strength / army.maxStrength));
      const radiusFactor = minRadius + (maxRadius - minRadius) * Math.pow(ratio, exponent);
      // Offset armies that share a contested tile so their glyphs don't
      // stack on the center. Position by index within tile.armies on a
      // small ring; a 2-occupant tile reads as two side-by-side circles.
      let ox = 0;
      let oy = 0;
      const tile = army.tile;
      if (tile && tile.armies.length > 1) {
        const arr = tile.armies;
        let idx = 0;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] === army) { idx = i; break; }
        }
        const angle = (idx / arr.length) * Math.PI * 2;
        const r = ts * 0.18;
        ox = Math.cos(angle) * r;
        oy = Math.sin(angle) * r;
      }
      const cx = (army.pos.x + 0.5) * ts + ox;
      const cy = (army.pos.y + 0.5) * ts + oy;
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
  // Paint each active player order as a brush stroke: a soft, alpha-
  // hatched rectangle in the player's color over the order's region,
  // plus an arrow pointing in the order vector. Alpha fades with
  // remaining TTL so a campaign that's almost over reads quieter than
  // a fresh push. Wraps the region across the map seam so a campaign
  // straddling the seam paints contiguously on the visible copy.
  drawOrders() {
    const ctx = this.ctx;
    const game = this.game;
    const orders = game.orders;
    if (!orders || orders.length === 0) return;
    const ts = this.tileSize;
    const z = this.zoom;
    const mapW = game.map.width;
    const mapH = game.map.height;
    const byId = game.players.byId;

    ctx.save();
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const player = byId.get(o.playerId);
      if (!player) continue;
      // Fade from full at birth to ~0.25 at expiry. We don't know the
      // original TTL here, only what's left, so use a fixed shape:
      //   alpha = 0.16 + 0.10 * min(ttl, 10) / 10
      // It's enough variation to read "this one is fresher" without
      // making short-TTL orders invisible.
      const ttlBoost = Math.min(o.ttl, 10) / 10;
      const baseAlpha = 0.16 + 0.10 * ttlBoost;
      const r = o.region;

      // Tile across the seam: on a wrap map a region with x+w > mapW
      // needs two passes so the renderer's tile-replicated world
      // shows it contiguously.
      const drawRect = (rx, ry, rw, rh) => {
        ctx.fillStyle = hexToRgba(player.color, baseAlpha);
        ctx.fillRect(rx * ts, ry * ts, rw * ts, rh * ts);
        ctx.strokeStyle = hexToRgba(player.accent, baseAlpha * 2.0);
        ctx.lineWidth = Math.max(1, ts * 0.06) / z;
        ctx.strokeRect(rx * ts, ry * ts, rw * ts, rh * ts);
      };

      drawRect(r.x, r.y, r.w, r.h);
      if (game.map.wrap) {
        if (r.x + r.w > mapW) drawRect(r.x - mapW, r.y, r.w, r.h);
        if (r.y + r.h > mapH) drawRect(r.x, r.y - mapH, r.w, r.h);
      }

      // Arrow from the region center along the vector. Length scales
      // with intensity so a half-intensity skirmish reads weaker than
      // a full-power campaign.
      const cx = (r.x + r.w / 2) * ts;
      const cy = (r.y + r.h / 2) * ts;
      const vlen = Math.hypot(o.vector.dx, o.vector.dy) || 1;
      const ux = o.vector.dx / vlen;
      const uy = o.vector.dy / vlen;
      const armLen = ts * Math.min(r.w, r.h) * 0.5 * (0.4 + 0.6 * o.intensity);
      const tipX = cx + ux * armLen;
      const tipY = cy + uy * armLen;
      const headLen = ts * 0.4;
      const headAngle = 0.55;
      const cos = Math.cos(headAngle);
      const sin = Math.sin(headAngle);
      // Two perpendiculars rotated by ±headAngle off the arrow tail.
      const tailX1 = tipX - headLen * (ux * cos - uy * sin);
      const tailY1 = tipY - headLen * (uy * cos + ux * sin);
      const tailX2 = tipX - headLen * (ux * cos + uy * sin);
      const tailY2 = tipY - headLen * (uy * cos - ux * sin);
      ctx.strokeStyle = hexToRgba(player.accent, 0.85);
      ctx.lineWidth = Math.max(2, ts * 0.10) / z;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tailX1, tailY1);
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tailX2, tailY2);
      ctx.stroke();
    }
    ctx.restore();
  }

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

  // Compute the iso-projection parameters used by the 3D view. Pulled
  // out so picking (pixelToTile) and drawing share the exact same
  // geometry — otherwise hover targeting drifts off-cell.
  _iso3DLayout() {
    const map = this.game.map;
    const W = map.width;
    const H = map.height;
    if (!W || !H) return null;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    // GameView doesn't expose game.maxArmy; derive the height ceiling
    // from the actual armies' caps so non-default maxArmy configs (or
    // tech multipliers) still scale columns correctly. Fall back to 6
    // (the engine default) when no armies have been seeded yet.
    let maxArmy = 0;
    for (const a of this.game.armies) {
      if (a.maxStrength > maxArmy) maxArmy = a.maxStrength;
    }
    if (!maxArmy) maxArmy = this.game.maxArmy || 6;
    // Each strength point lifts the column by heightPerUnit tile-units.
    // 0.35 is enough that a maxed army (~6) towers above a fresh spawn
    // (~1) while still leaving headroom inside the canvas.
    const heightPerUnit = 0.35;
    const isoWUnits = (W + H) / 2;
    const isoHUnits = (W + H) / 4 + maxArmy * heightPerUnit;
    const margin = 0.92;
    const baseTs = Math.min(cw / isoWUnits, ch / isoHUnits) * margin;
    const ts = baseTs * this.zoom;
    const hScale = ts * heightPerUnit;
    const bboxW = (W + H) * ts / 2;
    const bboxH = (W + H) * ts / 4 + maxArmy * hScale;
    // cx/cy is the screen position of cell (0,0,0). Centering the bbox
    // requires offsetting by H*ts/2 (left edge of bbox is at cell (0,H))
    // and maxArmy*hScale (top edge at the tallest possible column).
    const cx = (cw - bboxW) / 2 + H * ts / 2 - this.panX * ts;
    const cy = (ch - bboxH) / 2 + maxArmy * hScale - this.panY * ts;
    return { cx, cy, ts, hScale, W, H };
  }

  _draw3D(now) {
    const ctx = this.ctx;
    const game = this.game;
    const layout = this._iso3DLayout();
    if (!layout) return;
    const { cx, cy, ts, hScale, W, H } = layout;
    const map = game.map;

    const project = (gx, gy, gz) => ({
      x: cx + (gx - gy) * ts / 2,
      y: cy + (gx + gy) * ts / 4 - gz * hScale,
    });

    ctx.lineJoin = "miter";
    const outline = this.showGrid ? "rgba(0,0,0,0.32)" : null;

    // Painter's algorithm: cells with smaller (gx+gy) are deeper into
    // the scene and must be drawn first so nearer columns paint over
    // them. Cells at the same diagonal don't overlap each other (only
    // distinct rows of the iso lattice can stack on screen).
    const totalDiag = W + H - 1;
    for (let sum = 0; sum < totalDiag; sum++) {
      const minX = Math.max(0, sum - (H - 1));
      const maxX = Math.min(W - 1, sum);
      for (let gx = minX; gx <= maxX; gx++) {
        const gy = sum - gx;
        const tile = map.getTile(gx, gy);
        if (!tile) continue;
        this._draw3DCell(tile, gx, gy, project, outline);
      }
    }

    if (this.hoverTile) {
      this._outline3DTop(this.hoverTile, "rgba(255,255,255,0.55)", project, 2);
    }
    if (this.selectedTile) {
      this._outline3DTop(this.selectedTile, "#ffffff", project, 3);
    }
  }

  _draw3DCell(tile, gx, gy, project, outline) {
    const ctx = this.ctx;
    const owner = tile.ownerArmy();
    let color;
    let h;
    if (owner && owner.player) {
      color = owner.player.color;
      // Strength → height. Floor at a thin slab so even a 0.5-strength
      // army still reads as a colored marker, not as bare ground.
      h = Math.max(0.15, owner.strength);
    } else {
      // Neutral: a tinted slab that's clearly distinct from the
      // background but doesn't compete with player columns.
      color = "#1c2230";
      h = 0.08;
    }

    const tlt = project(gx, gy, h);
    const trt = project(gx + 1, gy, h);
    const brt = project(gx + 1, gy + 1, h);
    const blt = project(gx, gy + 1, h);
    const trg = project(gx + 1, gy, 0);
    const brg = project(gx + 1, gy + 1, 0);
    const blg = project(gx, gy + 1, 0);

    // Right face (visible in this projection because +x runs to the
    // right side of the camera). Slightly darkened so the column has
    // visible volume even when its top color is bright.
    ctx.fillStyle = shade(color, 0.7);
    ctx.beginPath();
    ctx.moveTo(trt.x, trt.y);
    ctx.lineTo(brt.x, brt.y);
    ctx.lineTo(brg.x, brg.y);
    ctx.lineTo(trg.x, trg.y);
    ctx.closePath();
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }

    // Front face (the +y face — closer to the camera in this iso).
    ctx.fillStyle = shade(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(blt.x, blt.y);
    ctx.lineTo(brt.x, brt.y);
    ctx.lineTo(brg.x, brg.y);
    ctx.lineTo(blg.x, blg.y);
    ctx.closePath();
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }

    // Top face — the player's color at full brightness. This is the
    // surface that reads as the Voronoi region from above.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tlt.x, tlt.y);
    ctx.lineTo(trt.x, trt.y);
    ctx.lineTo(brt.x, brt.y);
    ctx.lineTo(blt.x, blt.y);
    ctx.closePath();
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }

    // Accent rim on the top edge for owned tiles — separates same-color
    // neighbors at a glance even when their heights match.
    if (owner && owner.player) {
      ctx.strokeStyle = owner.player.accent;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(tlt.x, tlt.y);
      ctx.lineTo(trt.x, trt.y);
      ctx.lineTo(brt.x, brt.y);
      ctx.lineTo(blt.x, blt.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  _outline3DTop(tile, color, project, width) {
    const ctx = this.ctx;
    const owner = tile.ownerArmy();
    const h = owner && owner.player ? Math.max(0.15, owner.strength) : 0.08;
    const gx = tile.pos.x;
    const gy = tile.pos.y;
    const a = project(gx, gy, h);
    const b = project(gx + 1, gy, h);
    const c = project(gx + 1, gy + 1, h);
    const d = project(gx, gy + 1, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.stroke();
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

// Multiply an `#rrggbb` color's RGB channels by `factor`. Used to
// derive side-face shading from the top-face player color in 3D mode.
export function shade(hex, factor) {
  const m = hex.replace("#", "");
  const bigint = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const r = Math.max(0, Math.min(255, Math.round(((bigint >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((bigint >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((bigint & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}
