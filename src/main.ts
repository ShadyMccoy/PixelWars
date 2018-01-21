import { Agents } from "./Agents";
import { Goal } from "./Goal";
import { BackgroundMap } from "./BackGroundCanvas";
import { Controller } from "./Controller";
import { Army } from './Army';

export function runMain() {
  document.getElementById("p1").innerHTML = Goal.echo("ottO");
}

var bgm: BackgroundMap;
var agents: Agents;
var controller: Controller;
var initialized: boolean;

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

  let army1 = new Army(bgm.getTile(7).pos, 5, "Player1");
  agents.AddAgent(army1)

  controller = new Controller(bgm, UIController);
  bgm.drawMap();
  
  initialized = true;
}

export function animate() {
  if (!initialized) {return;}
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
