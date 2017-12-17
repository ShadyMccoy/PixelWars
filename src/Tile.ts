import { Army } from "./Army";

export class Tile {
  readonly x: number;
  readonly y: number;
  private width: number;
  private height: number;
  private ctx: CanvasRenderingContext2D;
  armies: Army[];

  constructor(x: number, y: number, w: number, h: number, ctx: CanvasRenderingContext2D) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.ctx = ctx;
    this.armies = new Array<Army>();
  }

  public registerArmy(army: Army) {
    this.armies.push(army);
  }

  public clear() {
    console.log('clear...');
    this.ctx.clearRect(
      this.width * this.x + 1,
      this.height * this.y + 1,
      this.width - 2,
      this.height - 2
    );
  }

  public draw() {
    this.ctx.rect(this.width * this.x, this.height * this.y, this.width, this.height);
    this.ctx.rect;
  }

  public drawSelection() {
    this.ctx.rect(this.width * this.x + 5, this.height * this.y + 5, this.width - 10, this.height - 10);
    this.ctx.rect;
    this.ctx.stroke();
  }

  public drawArmies() {
    this.armies.forEach(a => a.draw(this.x, this.y, this.width, this.height, this.ctx));
  }
}
