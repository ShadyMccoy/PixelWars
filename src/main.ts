import { Agents } from "./Agents";
import { Goal } from "./Goal";
import { BackgroundMap } from "./BackGroundCanvas";
import { Controller } from "./Controller";

export function runMain() {
  document.getElementById("p1").innerHTML = Goal.echo("ottO");
}

var bgm: BackgroundMap;
var agents: Agents;
var controller: Controller;

export function init(
  UIBackground: HTMLCanvasElement,
  UIAgents: HTMLCanvasElement,
  UIController: HTMLCanvasElement
) {
  bgm = new BackgroundMap({
    canvas: UIBackground,
    map: { width: 10, height: 5 }
  });

  agents = new Agents(bgm, UIAgents);
  controller = new Controller(bgm, UIController);
  bgm.drawMap();
}

export function animate() {
  bgm.drawMap();
  controller.drawController();
}

export function onGameClick(x: number, y: number) {
  console.log("onGameClick" + x);
  controller.SelectTile(x, y);
}

export function onKeyboardPress(key: string) {
  console.log("keyboard" + key);
}
