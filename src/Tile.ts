import { Agent } from './Agents';
import { GamePos } from './GamePos';

export class Tile {
  readonly pos: GamePos;
  private width: number;
  private height: number;
  private ctx: CanvasRenderingContext2D;
  private agents : Agent[];

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
    this.agents = new Array<Agent>();
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

  public registerAgent(agent: Agent) {
    this.agents.push(agent);
  }
}
