import { Agents, Agent } from './Agents';
import { GamePos } from "./GamePos";
import { BackgroundMap } from './BackGroundCanvas';
import { Tile } from './Tile';

let MAXARMYSIZE = 4;

export class Army extends Agent {
  private strength: number;
  private player: string;

  constructor(pos: GamePos, strength: number, player: string) {
    super(pos,"Army");
    this.pos = pos;
    this.strength = strength;
    this.player = player;
  }

  public getPlayer() : string {
    return this.player;
  }
  
  public getStrength() : number {
    return this.strength;
  }

  public joinForces(army: Army) {
    this.strength += army.getStrength();
    army.DeleteAgent();
  }
  
  public attack(tile: Tile, power: number) {
    if (tile === undefined) { return; }
    if (power <= 1) { return; }
    if (this.strength - power < 1) { return; }

    this.strength -= power;
    let newArmy = new Army(tile.pos, power, this.player);

    BackgroundMap.getTileFromPos(tile.pos).registerArmy(newArmy);
  }

  public runAgent(interval : number) : void {
    this.strength += interval;
    if (this.strength > MAXARMYSIZE) { this.strength = MAXARMYSIZE }
    this.attack(BackgroundMap.getAdjacentTile(this.pos),Math.random() * this.strength);
  }

  public draw(
  ) : void {
    let width = BackgroundMap.getTileWidth() * this.strength / MAXARMYSIZE;
    let height = BackgroundMap.getTileHeight() * this.strength / MAXARMYSIZE;
    
    let x = BackgroundMap.getTileWidth()*(this.pos.x + 0.5)-width/2;
    let y = BackgroundMap.getTileHeight()*(this.pos.y + 0.5)-height/2 ;
    let ctx = Agents.ctx;

    ctx.beginPath();
    ctx.strokeStyle = "red";
    ctx.rect(x,y,width,height);
    ctx.stroke();
  }
}
