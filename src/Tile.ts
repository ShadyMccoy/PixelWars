import { Agent } from './Agents';

export class GamePos {
  public id: number;
  public x: number;
  public y: number;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }
}

export class Tile {
  readonly pos: GamePos;
  private width: number;
  private height: number;
  private ctx: CanvasRenderingContext2D;

  constructor(
    pos: GamePos,
    w: number,
    h: number,
    ctx: CanvasRenderingContext2D
  ) {
    this.pos = pos;
    this.width = w;
    this.height = h;
    this.ctx = ctx;
  }

  public registerAgent(agent: Agent) {
    Agents.push(agent);
  }

  public clear() {
    this.ctx.clearRect(
      this.width * this.pos.x + 1,
      this.height * this.pos.y + 1,
      this.width - 2,
      this.height - 2
    );
  }

  public draw() {
    this.ctx.rect(
      this.width * this.pos.x,
      this.height * this.pos.y,
      this.width,
      this.height
    );
    this.ctx.rect;
  }

  public drawSelection() {
    this.ctx.rect(
      this.width * this.pos.x + 5,
      this.height * this.pos.y + 5,
      this.width - 10,
      this.height - 10
    );
    this.ctx.rect;
    this.ctx.stroke();
  }
}
