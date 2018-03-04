import { Army } from './Army';
import { GameState } from './GameState';

let game = new GameState();

export function init(
  UIBackground: HTMLCanvasElement,
  UIAgents: HTMLCanvasElement,
  UIController: HTMLCanvasElement
) {

  game.createBackground({
    canvas: UIBackground,
    map: { width: 30, height: 30 }
  });
  
  game.createAgents(UIAgents);
  
  let t = game.getBackground().getTile(0);
  t.registerArmy(new Army(t.pos, 1, "Player2", game));
  
  t = game.getBackground().getTile(899);
  t.registerArmy(new Army(t.pos, 1, "Player1", game));

  game.createController(UIController);

  game.getBackground().drawMap();
}

export function runAgents() {
  game.getAgents().runAgents(0.01);
  game.getBackground().resolveConflicts();
}

export function animate() {
  game.getAgents().drawAgents();
  game.getController().drawController();
}

export function onGameClick(x: number, y: number) {
  console.log("onGameClick" + x);
  game.getController().SelectTile(x, y);
}

export function onKeyboardPress(key: string) {
  console.log("keyboard" + key);
}
