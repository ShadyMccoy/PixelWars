export class Controls {
  constructor({ app }) {
    this.app = app;
    this.bind();
  }

  bind() {
    const $ = (sel) => document.querySelector(sel);
    this.btnPlay = $("#btn-play");
    this.btnStep = $("#btn-step");
    this.btnReset = $("#btn-reset");
    this.speed = $("#speed");
    this.speedLabel = $("#speed-label");
    this.toggleGrid = $("#toggle-grid");
    this.toggleTerritory = $("#toggle-territory");
    this.toggleGlow = $("#toggle-glow");
    this.toggleMoves = $("#toggle-moves");
    this.toggleOverlay = $("#toggle-overlay");
    this.tickLabel = $("#tick-label");
    this.eventLog = $("#event-log");

    this.btnPlay.addEventListener("click", () => this.app.togglePlay());
    this.btnStep.addEventListener("click", () => this.app.stepOnce());
    this.btnReset.addEventListener("click", () => this.app.reload());
    this.speed.addEventListener("input", () => {
      const v = parseFloat(this.speed.value);
      this.app.setSpeed(v);
      this.speedLabel.textContent = `${v.toFixed(1)}x`;
    });
    this.toggleGrid.addEventListener("change", () => {
      this.app.renderer.showGrid = this.toggleGrid.checked;
      this.app.markDirty();
    });
    this.toggleTerritory.addEventListener("change", () => {
      this.app.renderer.showTerritory = this.toggleTerritory.checked;
      this.app.markDirty();
    });
    this.toggleGlow.addEventListener("change", () => {
      this.app.renderer.showGlow = this.toggleGlow.checked;
      this.app.markDirty();
    });
    this.toggleMoves.addEventListener("change", () => {
      this.app.renderer.showMoves = this.toggleMoves.checked;
      this.app.markDirty();
    });
    this.toggleOverlay.addEventListener("change", () => {
      this.app.setOverlay(this.toggleOverlay.checked);
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.app.togglePlay();
      } else if (e.key === "r" || e.key === "R") {
        this.app.reload();
      } else if (e.key === ".") {
        this.app.stepOnce();
      }
    });
  }

  setPlaying(playing) {
    this.btnPlay.textContent = playing ? "⏸ Pause" : "▶ Play";
  }

  setTick(t) {
    this.tickLabel.textContent = `t=${t}`;
  }

  log(message) {
    if (!this.eventLog) return;
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.textContent = message;
    this.eventLog.prepend(entry);
    while (this.eventLog.children.length > 30) {
      this.eventLog.removeChild(this.eventLog.lastChild);
    }
  }
}
