

var main = function(callback) {
  System.import("main").then(callback);
};

function captureMouseClick(e) {
  main(function(m) {
    m.onGameClick(e.clientX, e.clientY);
  });
}

function initAnimate() {
  var BackgroundCanvas = document.getElementById("BackgroundCanvas");
  var AgentCanvas = document.getElementById("AgentsCanvas");
  var ControllerCanvas = document.getElementById("ControllerCanvas");
  ControllerCanvas.addEventListener("click", captureMouseClick);
  
  main(function(m) {
    m.init(BackgroundCanvas, AgentCanvas, ControllerCanvas);
  });
}

function Animate() {
  main(function(m) {
    m.animate();
  });
}

function RunAgents() {
  main(function(m) {
    m.runAgents();
  });
}

function initGame() {
  initAnimate();
  
  setInterval(RunAgents,10);
  AnimateLoop();
}

function AnimateLoop() {
  requestAnimationFrame(AnimateLoop);
  Animate();
}

