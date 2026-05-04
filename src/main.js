import { Game } from "./core/Game.js";
import { MODES } from "./modes/index.js";
import { Renderer } from "./render/Renderer.js";
import { StatsChart } from "./render/StatsChart.js";
import { HUD } from "./ui/HUD.js";
import { Controls } from "./ui/Controls.js";

class App {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.chartCanvas = document.getElementById("chart-canvas");
    this.hudRoot = document.getElementById("hud-root");
    this.modeKey = "classic";
    this.mode = null;
    this.playing = true;
    this.speed = 1;
    this.lastFrame = performance.now();
    this.tickAccumulator = 0;
    this.tickInterval = 1 / 30;
    this.activePlayer = null;
    this.lastWinnerLogged = null;

    this.controls = new Controls({ app: this });

    this.populateModeSelect();
    this.loadMode(this.modeKey);
    this.startLoop();
  }

  populateModeSelect() {
    const sel = document.getElementById("mode-select");
    sel.innerHTML = "";
    for (const [key, m] of Object.entries(MODES)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = m.name;
      sel.appendChild(opt);
    }
    sel.value = this.modeKey;
  }

  loadMode(key) {
    this.modeKey = key;
    const def = MODES[key];
    this.mode = { key, ...def };
    this.game = new Game(def.config);
    def.setup(this.game);

    document.getElementById("mode-description").textContent = def.description;

    if (!this.renderer) {
      this.renderer = new Renderer({ canvas: this.canvas, game: this.game });
    } else {
      this.renderer.setGame(this.game);
    }

    if (!this.chart) {
      this.chart = new StatsChart({ canvas: this.chartCanvas, game: this.game });
    } else {
      this.chart.setGame(this.game);
    }

    if (!this.hud) {
      this.hud = new HUD({ root: this.hudRoot, game: this.game, app: this });
    } else {
      this.hud.setGame(this.game);
    }

    this.activePlayer = this.game.players.list[0] ?? null;
    this.lastWinnerLogged = null;
    this.controls.setMode(key);
    this.controls.log(`Loaded "${def.name}"`);
    this.bindCanvas();
    this.playing = true;
    this.controls.setPlaying(true);
  }

  bindCanvas() {
    if (this._canvasBound) return;
    this._canvasBound = true;
    this.canvas.addEventListener("mousemove", (e) => {
      this.renderer.hoverTile = this.renderer.pixelToTile(e.clientX, e.clientY);
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.renderer.hoverTile = null;
    });
    this.canvas.addEventListener("click", (e) => {
      const tile = this.renderer.pixelToTile(e.clientX, e.clientY);
      if (!tile) return;
      this.renderer.selectedTile = tile;
      if (this.mode.key === "sandbox" && this.activePlayer) {
        this.game.placeArmy({ x: tile.pos.x, y: tile.pos.y, player: this.activePlayer, strength: 2 });
        this.controls.log(`Spawned ${this.activePlayer.name} army at (${tile.pos.x}, ${tile.pos.y})`);
      }
    });
  }

  setActivePlayer(player) {
    this.activePlayer = player;
    this.hud.update();
  }

  togglePlay() {
    this.playing = !this.playing;
    this.controls.setPlaying(this.playing);
  }

  stepOnce() {
    this.game.step(this.tickInterval);
  }

  reload() {
    this.loadMode(this.modeKey);
  }

  startLoop() {
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      if (this.playing) {
        this.tickAccumulator += dt * this.speed;
        let safety = 32;
        while (this.tickAccumulator >= this.tickInterval && safety-- > 0) {
          this.game.step(this.tickInterval);
          this.tickAccumulator -= this.tickInterval;
        }
      }
      this.renderer.draw(now);
      this.chart.draw();
      this.hud.update();
      this.controls.setTick(this.game.tick);
      this.checkWinner();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  checkWinner() {
    const alive = this.game.livingPlayers();
    if (alive.length === 1 && this.game.tick > 30 && this.lastWinnerLogged !== alive[0].id) {
      this.lastWinnerLogged = alive[0].id;
      this.controls.log(`👑 ${alive[0].name} wins!`);
    } else if (alive.length === 0 && this.game.tick > 30 && this.lastWinnerLogged !== "draw") {
      this.lastWinnerLogged = "draw";
      this.controls.log(`💀 Mutual destruction.`);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
