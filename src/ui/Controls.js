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
    this.btnReplay = $("#btn-replay");
    this.btnSave = $("#btn-save");
    this.speed = $("#speed");
    this.speedLabel = $("#speed-label");
    this.toggleGrid = $("#toggle-grid");
    this.toggleTerritory = $("#toggle-territory");
    this.toggleGlow = $("#toggle-glow");
    this.toggleMoves = $("#toggle-moves");
    this.toggleOverlay = $("#toggle-overlay");
    this.tickLabel = $("#tick-label");
    this.seedPill = $("#seed-pill");
    this.eventLog = $("#event-log");

    this.btnPlay.addEventListener("click", () => this.app.togglePlay());
    this.btnStep.addEventListener("click", () => this.app.stepOnce());
    this.btnReset.addEventListener("click", () => this.app.reload());
    this.btnReplay?.addEventListener("click", () => this.app.replaySameSeed());
    this.btnSave?.addEventListener("click", () => this.app.saveCurrentMatch());
    this.seedPill?.addEventListener("click", () => this._copySeed());
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
      } else if (e.key === "l" || e.key === "L") {
        this.app.replaySameSeed();
      } else if (e.key === "s" || e.key === "S") {
        this.app.saveCurrentMatch();
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

  // Mirror the active match's seed in the header pill so users can see
  // it without scanning the mode-description line.
  updateMatchInfo(info) {
    if (!this.seedPill) return;
    if (!info || info.seed == null) {
      this.seedPill.textContent = "seed=–";
      this.seedPill.title = "No active match";
    } else {
      this.seedPill.textContent = `seed=${info.seed}`;
      this.seedPill.title = `Click to copy ${info.seed}`;
    }
  }

  // Append a log line. When `replayInfo` is supplied the line becomes a
  // clickable replay shortcut — clicking it re-runs that exact match.
  log(message, replayInfo = null) {
    if (!this.eventLog) return;
    const entry = document.createElement("div");
    entry.className = "log-entry";
    if (replayInfo && replayInfo.seed != null) {
      entry.classList.add("log-replay");
      entry.title = `Click to replay (seed=${replayInfo.seed})`;
      entry.textContent = `${message}  ↺`;
      entry.addEventListener("click", () => {
        this.app.loadFromMatchInfo(replayInfo);
      });
    } else {
      entry.textContent = message;
    }
    this.eventLog.prepend(entry);
    while (this.eventLog.children.length > 30) {
      this.eventLog.removeChild(this.eventLog.lastChild);
    }
  }

  async _copySeed() {
    const info = this.app.currentMatch;
    if (!info || info.seed == null) return;
    try {
      await navigator.clipboard.writeText(String(info.seed));
      this.log(`📋 Copied seed=${info.seed}`);
    } catch {
      // Silently ignore clipboard rejection (older browsers, insecure
      // origin, etc.) — the seed is also visible in mode-description.
    }
  }
}
