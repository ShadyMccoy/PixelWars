var BackgroundCanvas = document.getElementById("BackgroundCanvas");
var AgentCanvas = document.getElementById("AgentsCanvas");
var ControllerCanvas = document.getElementById("ControllerCanvas");

var main = function(callback) {
  System.import("main").then(callback);
};

function captureMouseClick(e) {
  main(function(m) {
    m.onGameClick(e.clientX, e.clientY);
  });
}
ControllerCanvas.addEventListener("click", captureMouseClick);

function initAnimate() {
  main(function(m) {
    m.init(BackgroundCanvas, AgentCanvas, ControllerCanvas);
  });
}

function Animate() {
  main(function(m) {
    m.animate();
  });
}
function GameLoop() {
  requestAnimationFrame(GameLoop);
  Animate();
}

function initGame() {
  initAnimate();
  GameLoop();
}
