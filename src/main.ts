import { Agents } from "./Agents";
import { Goal } from "./Goal";
import { BackgroundMap } from "./BackGroundCanvas";
import { Controller } from "./Controller";

export function runMain() {
  document.getElementById("p1").innerHTML = Goal.echo("ottO");
}

var initialized: boolean;

export function init(
  UIBackground: HTMLCanvasElement,
  UIAgents: HTMLCanvasElement,
  UIController: HTMLCanvasElement
) {
  BackgroundMap.init({
    canvas: UIBackground,
    map: { width: 10, height: 5 }
  });

  Agents.init(UIAgents);

  Controller.init(UIController);
  BackgroundMap.drawMap();
  
  initialized = true;
}

export function runAgents() {
  Agents.runAgents(0.01);
}

export function animate() {
  if (!initialized) {return;}
  BackgroundMap.drawMap();
  Agents.drawAgents();
  Controller.drawController();
}

export function onGameClick(x: number, y: number) {
  console.log("onGameClick" + x);
  Controller.SelectTile(x, y);
}

export function onKeyboardPress(key: string) {
  console.log("keyboard" + key);
}
