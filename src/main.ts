import { Army } from './Army';
import { GameState } from './GameState';
import { Player } from './Player';

let game = new GameState();

export function init(
  UIBackground: HTMLCanvasElement,
  UIAgents: HTMLCanvasElement,
  UIController: HTMLCanvasElement
) {

  game.createBackground({
    canvas: UIBackground,
    map: { width: 100, height: 100 }
  });
  
  game.createAgents(UIAgents);
  game.createPlayers();
  let player1 = new Player("Player1","red",SlowAndSteady);
  let player2 = new Player("Player1","red",Repel);
  game.AddPlayer(player1);
  game.AddPlayer(player2);
  
  let t = game.getBackground().getTile(0);
  t.registerArmy(new Army(t.pos, 1, player2, game));
  
  t = game.getBackground().getTile(899);
  t.registerArmy(new Army(t.pos, 1, player1, game));

  t = game.getBackground().getTile(3544);
  t.registerArmy(new Army(t.pos, 1, player1, game));

  game.createController(UIController);

  game.getBackground().drawMap();
}


function SlowAndSteady(army : Army) : void {
  let tile = army.getWeakestAdjacentTile();
  if (!tile) { return; } 
  let enemyArmies = tile.getArmies();
  
  let enemyStrength = army.getArmiesStrength(enemyArmies);

  if (enemyArmies.length > 0 && enemyArmies[0].getPlayer().equals(army.getPlayer())) {
    army.attack(tile, army.getStrength() - (army.getStrength() + enemyStrength) / 2);
    return;
  }

  if (enemyStrength + 1 < army.getStrength()) {
    army.attack(tile, army.getStrength() - 1);
  }
}


function Repel(army : Army) : void {
  let gradient = [-2,2,-2,3];
  let tile = army.getWeakestAdjacentTile(gradient);
  if (!tile) { return; } 
  let enemyArmies = tile.getArmies();
  
  let enemyStrength = army.getArmiesStrength(enemyArmies);
  let direction = army.pos.directionTo(tile.pos);
  let currGradient = 0;
  if (direction >= 0) { currGradient = gradient[direction]; }
  if (enemyArmies.length > 0 && enemyArmies[0].getPlayer().equals(army.getPlayer())) {
    army.attack(tile, currGradient + army.getStrength() - (army.getStrength() + enemyStrength) / 2);
    return;
  }

  if (enemyStrength - currGradient < army.getStrength()) {
    army.attack(tile, army.getStrength() - 1);
  }
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
