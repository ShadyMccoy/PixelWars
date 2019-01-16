import { Agent } from "./Agents";
import { GamePos } from "./GamePos";
import { Tile } from "./Tile";
import { GameState } from "./GameState";
import { Player } from './Player';

let MAX_ARMY_SIZE = 10;

export class Army extends Agent {
  private strength: number;
  private player: Player;
  private strategy : (army : Army) => void;

  constructor(pos: GamePos, strength: number, player: Player, game: GameState, attackStrategy ?: (army : Army) => void) {
    super(pos, "Army", game);
    this.pos = pos;
    this.strength = strength;
    this.player = player;

    this.strategy = attackStrategy;
  }

  public getPlayer(): Player {
    return this.player;
  }

  public getStrength(): number {
    return this.strength;
  }

  public FightArmy(ArmyStrength: number): void {
    this.strength -= ArmyStrength;
  }

  public joinForces(army: Army) {
    this.strength += army.getStrength();
    army.DeleteAgent();
  }

  private isAttackValid(tile : Tile, power : number) : boolean {
    if (tile === undefined) {
      return false;
    }

    //if (!this.pos.isAdjacentTo(tile.pos)) { return false; }
    if (this.pos.equals(tile.pos)) {
      return false;
    }
    if (power <= 0.5) {
      return false;
    }
    if (this.strength - power < 1) {
      return false;
    }

    return true;
  }

  public attack(tile: Tile, power: number) {
    if (!this.isAttackValid(tile,power)) { return; }

    this.strength -= power;
    let newArmy = new Army(tile.pos, power, this.player, this.game);
    this.game
      .getBackground()
      .getTileFromPos(tile.pos)
      .registerArmy(newArmy);
  }

  public runAgent(interval: number): void {
    this.strength += interval;
    if (this.strength > MAX_ARMY_SIZE) {
      this.strength = MAX_ARMY_SIZE;
    }

    if (typeof(this.strategy) === typeof(Function)) {
      this.strategy(this);
    } else {
      this.player.getStrategy()(this);
    }

//    if (this.player == "Player1") {
//      this.SlowAndSteady();
//    }
//    else {
//      this.Repel();
//    }
  }

  //private RandomAttack() : void {
  //  this.attack(this.game.getBackground().getRandomAdjacentTile(this.pos),Math.random() * this.strength);
 // }


  public getWeakestAdjacentTile(gradient = [0,0,0,0]): Tile {
    let bgm = this.game.getBackground();
    let tile1 = bgm.getAdjacentTile(this.pos, 0);
    let tile2 = bgm.getAdjacentTile(this.pos, 1);

    let currGradient = 0;
    let returnTile = this.getWeakerTile(tile1,tile2,gradient[currGradient],gradient[1]);
    if (returnTile && returnTile.equals(tile2)) { currGradient = 1; }
    tile2 = bgm.getAdjacentTile(this.pos, 2);
    returnTile = this.getWeakerTile(returnTile,tile2,gradient[currGradient],gradient[2]);
    if (returnTile && returnTile.equals(tile2)) { currGradient = 2; }
    tile2 = bgm.getAdjacentTile(this.pos, 3);
    returnTile = this.getWeakerTile(returnTile,tile2,gradient[currGradient],gradient[3]);
    
    if (!returnTile) { return undefined; }
    
    return this.game.getBackground().EnsureValidTileFromPos(returnTile.pos);
  }

  private getWeakerTile(tile1 : Tile, tile2 : Tile, gradient1 : number, gradient2 : number) : Tile {
    if (!tile2 || !tile2.pos) {
      return tile1;
    } else if (!tile1 || !tile1.pos) {
      return tile2;
    } else if ( tile1.equals(tile2) ) { 
      return tile1;
    }

    if (
      this.getArmiesStrength(tile1.getArmies()) - gradient1 >
        this.getArmiesStrength(tile2.getArmies()) - gradient2
    ) {
      return tile2;
    } else { 
      return tile1;
    }
  }


  public getArmiesStrength(armies: Army[]): number {
    let strength = 0;
    armies.forEach(a => (strength += a.getStrength()));
    return strength;
  }

  public getGame() : GameState {
    return this.game;
  }

  public draw(): void {
    let map = this.game.getBackground();
    let width = map.getTileWidth() * this.strength / MAX_ARMY_SIZE;
    let height = map.getTileHeight() * this.strength / MAX_ARMY_SIZE;

    let x = map.getTileWidth() * (this.pos.x + 0.5) - width / 2;
    let y = map.getTileHeight() * (this.pos.y + 0.5) - height / 2;
    let ctx = this.game.getAgents().ctx;

    ctx.beginPath();
    ctx.strokeStyle = this.player.getColor();
    ctx.rect(x, y, width, height);
    ctx.stroke();
  }

  private SplitPlayer() {
    let player = this.getPlayer();
    let NewPlayer = new Player(
      Math.random().toString(36).slice(2), 
      '#'+Math.floor(Math.random()*16777215).toString(16),
      this.strategy);

    let NewWeights = NewPlayer.weights.slice();
    //NewWeights.forEach(weight => {
    //  weight += (0.5-Math.random())/10;
    //});
  }
}
