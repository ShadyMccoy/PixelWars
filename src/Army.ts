import { Agent } from "./Agents";
import { GamePos, Tile } from "./Tile";

export class Army extends Agent {
  private strength: number;
  private player: string;

  constructor(pos: GamePos, strength: number, player: string) {
    super(pos);
    this.pos = pos;
    this.strength = strength;
    this.player = player;
  }

  public attack(tile: Tile, power: number) {
    if (power > this.strength) {
      power = this.strength;
    }

    this.strength -= power;
    tile.registerAgent(new Army(tile.pos, power, this.player));
  }

  public runAgent(interval : number) : void {
    this.strength += interval;
    //this.attack()
  }

  public draw(
    x: number,
    y: number,
    width: number,
    height: number,
    ctx: CanvasRenderingContext2D
  ) : void {
    ctx.beginPath();
    ctx.fillStyle = "red";
    ctx.arc(width * (x + 0.5), height * (y + 0.5), this.strength * width / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
