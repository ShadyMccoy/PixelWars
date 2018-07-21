import { Army } from './Army';
import { GameState } from './GameState';
import { Player } from './Player';
import { GamePos } from './GamePos';

let game = new GameState();

export function init(
  UIBackground: HTMLCanvasElement,
  UIAgents: HTMLCanvasElement,
  UIController: HTMLCanvasElement
) {

  game.createBackground({
    canvas: UIBackground,
    map: { width: 40, height: 30 }
  });
  
  game.createAgents(UIAgents);
  game.createPlayers();
  let player1 = new Player("Player1","red",SlowAndSteady);
  let player2 = new Player("Player2","blue",Repel);
  let player3 = new Player("Player3","purple",Trinity);
  game.AddPlayer(player1);
  game.AddPlayer(player2);
  game.AddPlayer(player3);
  
  let t = game.getBackground().getTile(200);
  t.registerArmy(new Army(t.pos, 1, player1, game));
  
  t = game.getBackground().getTile(600);
  t.registerArmy(new Army(t.pos, 1, player2, game));

  t = game.getBackground().getTile(1050);
  t.registerArmy(new Army(t.pos, 1, player3, game));

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

function Trinity(army : Army) : void {
  if (!army) { return; }
  
  function TileWeight(armies : Army[]) : number {
    let score = 0;
    armies.forEach( a => {
      if (army.getPlayer().equals(a.getPlayer())) {
        score += a.getStrength();
      } else {
        score -= a.getStrength();
      }
    })

    return score;
  }
  
  let bgm = army.getGame().getBackground();
  
  let inputs = [];

  for (let i=-2;i<=2;i++) {
    inputs[i+2] = [0,0,0,0,0];
    for (let j=-2;j<=2;j++) {
      inputs[i+2][j+2] = TileWeight(bgm.EnsureValidTileFromPos(new GamePos(-1,army.pos.x+j,army.pos.y+i)).getArmies());
    }
  }

    let player = army.getPlayer();
    let weights = player.weights;
    
  function EvalWeights(weights : number[][],inputs : number[][]) : number {
    let score = 0;

    for (let i=0;i<5;i++) {
      for (let j=0;j<5;j++) {
        score += inputs[i][j] * weights[i][j];
      }
    }

    return score;
  }

  function EvalOutputs(weights : number[][][],inputs : number[][]) {
    let bestDir = 0;
    let bestScore = EvalWeights(weights[0],inputs)
    for (let i=1; i<4; i++) {
      let NewScore = EvalWeights(weights[i],inputs);
      if (NewScore > bestScore) {
        bestScore = NewScore;
        bestDir = i;
      }
    }

    return bestDir;
  }

  let dir = EvalOutputs(weights,inputs);
  if (dir < 0) { return; }
  let tile = game.getBackground().getAdjacentTile(army.pos,dir);

  army.attack(tile, army.getStrength() - 1);
}

export function runAgents() {
  game.getAgents().runAgents(0.01);
  game.getBackground().resolveConflicts();
}

export function ToggleAnimate() {
  game.isAnimating = !game.isAnimating;
}

export function animate() {
  if (!game.isAnimating) return;
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
