import { Agents } from "./Agents";
import { Goal } from "./Goal";
import { BackgroundMap } from "./BackGroundCanvas";
import { Controller } from "./Controller";
import { Army } from './Army';
import { GamePos } from './GamePos';

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
    map: { width: 20, height: 20 }
  });

  Agents.init(UIAgents);
  Agents.AddAgent( new Army( new GamePos(7,7,0), 1, "Player1"));

  Controller.init(UIController);
  BackgroundMap.drawMap();
  
  initialized = true;
}

export function runAgents() {
  Agents.runAgents(0.01);
  BackgroundMap.resolveConflicts();
}

export function animate() {
  if (!initialized) {return;}
  //BackgroundMap.drawMap();
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
