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

    this.drawArmies(now);

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
