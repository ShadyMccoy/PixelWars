import { Agent } from './Agents';
import { Army } from './Army';

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

  public resolveConflicts() {
    let results: { [playerName: string]: number; } = {};
    this.agents.forEach( a => {
      let army = <Army>a;
      
      if (!results[army.getPlayer()]) { 
        results[army.getPlayer()] = 0;
      }

      results[army.getPlayer()] += army.getStrength();
    });

    this.agents = new Array<Agent>();
    Object.keys(results).forEach( playerName => {
      this.agents.push(new Army(this.pos,results[playerName],playerName))
    });
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
