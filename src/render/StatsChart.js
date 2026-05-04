import { hexToRgba } from "./Renderer.js";

export class StatsChart {
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

    let max = 1;
    for (const s of samples) {
      for (const p of this.game.players.list) {
        max = Math.max(max, s[p.id] ?? 0);
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (const p of this.game.players.list) {
      ctx.beginPath();
      ctx.lineWidth = 2 * this.dpr;
      ctx.strokeStyle = p.color;
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * w;
        const v = samples[i][p.id] ?? 0;
        const y = h - (v / max) * h * 0.95 - h * 0.025;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = hexToRgba(p.color, 0.1);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }
  }
}
