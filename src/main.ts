import { Goal } from "./Goal";
import { BackgroundMap } from "./BackGroundCanvas";

export function runMain() {
  document.getElementById("p1").innerHTML = Goal.echo("ottO");
}

var bgm: BackgroundMap;
export function initCanvas(canvas: HTMLCanvasElement) {
  bgm = new BackgroundMap({ canvas: canvas, map: { width: 10, height: 5 } });
  bgm.drawMap();
}

export function animate() {
}

export function onGameClick(x: number, y: number) {
  console.log("onGameClick" + x);
  bgm.SelectTile(x, y);
}
