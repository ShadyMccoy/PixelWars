import { hexToRgba } from "./Renderer.js";

export class TerritoryChart {
  constructor({ canvas, game }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setGame(game) {
    this.game = game;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#0a0d14";
    ctx.fillRect(0, 0, w, h);

    const samples = this.game.history;
    if (samples.length < 2) return;

    const list = this.game.players.list;
    if (list.length === 0) return;

    const totalTiles = this.game.map.width * this.game.map.height;
    if (totalTiles <= 0) return;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const n = samples.length;
    const lower = new Float32Array(n);
    const upper = new Float32Array(n);

    for (let pi = 0; pi < list.length; pi++) {
      const p = list[pi];
      for (let i = 0; i < n; i++) {
        const terr = samples[i].terr;
        const v = terr ? (terr[p.id] ?? 0) : 0;
        upper[i] = lower[i] + v / totalTiles;
      }

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = h - upper[i] * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = n - 1; i >= 0; i--) {
        const x = (i / (n - 1)) * w;
        const y = h - lower[i] * h;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = hexToRgba(p.color, 0.65);
      ctx.fill();
      ctx.lineWidth = 1 * this.dpr;
      ctx.strokeStyle = hexToRgba(p.color, 0.95);
      ctx.stroke();

      for (let i = 0; i < n; i++) lower[i] = upper[i];
    }
  }
}
