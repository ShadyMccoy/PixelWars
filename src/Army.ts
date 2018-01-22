import { Agents, Agent } from './Agents';
import { GamePos } from "./GamePos";
import { BackgroundMap } from './BackGroundCanvas';
import { Tile } from './Tile';

export class Army extends Agent {
  private strength: number;
  private player: string;

  constructor(pos: GamePos, strength: number, player: string) {
    super(pos);
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
  
  public attack(tile: Tile, power: number) {
    if (tile === undefined) { return; }
    if (power > this.strength) {
      power = this.strength;
    }

    this.strength -= power;
    Agents.AddAgent(new Army(tile.pos, power, this.player));
  }

  public runAgent(interval : number) : void {
    this.strength += interval;
    this.attack(BackgroundMap.getAdjacentTile(this.pos),this.strength / 2);
  }

  public draw(
  ) : void {
    let x = this.pos.x;
    let y = this.pos.y;
    let width = BackgroundMap.getTileWidth();
    let height = BackgroundMap.getTileHeight();
    let ctx = Agents.ctx;

    ctx.beginPath();
    ctx.fillStyle = "red";
    ctx.arc(width * (x + 0.5), height * (y + 0.5), this.strength * width / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
