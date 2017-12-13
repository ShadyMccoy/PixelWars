var canvas = document.getElementById("layer3");
var main = function(callback) {
  System.import("main").then(callback);
};

function captureMouseClick(e) {
    main(function (m) {
        m.onGameClick(e.clientX, e.clientY);
    });
}
canvas.addEventListener("click", captureMouseClick);

function initAnimate() {
  main(function(m) {
    m.initCanvas(canvas);
  });
}
function Animate() {
  main(function(m) {
    m.animate();
  });
}
function GameLoop() {
//    console.log('GameLoop')
  requestAnimationFrame(GameLoop);
  Animate();
}

function initGame() {
    initAnimate();
    GameLoop();
}