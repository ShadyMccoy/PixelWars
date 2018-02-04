import { GamePos } from './GamePos';
import { GameState } from './GameState';

export class Agents {
  private agents: AgentCollection;
  public ctx: CanvasRenderingContext2D;
  public lastTick: number;
  //private game: GameState;

  public constructor(canvas: HTMLCanvasElement, game: GameState) {
    this.ctx = canvas.getContext("2d");
    this.agents = {};
    this.lastTick = 0;
    //this.game = game;
  }

  public AddAgent(agent: Agent) : void {
    this.agents[agent.AgentID] = agent;
  }

  removeAgent(id: string): void {
    delete this.agents[id];
  }

  public runAgents(interval: number): void {
    this.lastTick += 1;
    console.log(Object.keys(this.agents).length);
    
    Object.keys(this.agents).forEach(k => {
      let agent = this.agents[k];
      if (agent.lastTick < this.lastTick) {
        agent.runAgent(interval);
      }
      agent.lastTick = this.lastTick;
    });
  }

  public drawAgents() {
    this.ctx.clearRect(0,0,this.ctx.canvas.width,this.ctx.canvas.height);
    this.ctx.beginPath();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 1;

    Object.keys(this.agents).forEach(k => this.agents[k].draw());
    this.ctx.stroke();
  }
}

interface AgentCollection {
  [AgentID: string]: Agent;
}

export abstract class Agent {
  public pos: GamePos;
  readonly AgentType: string;
  readonly AgentID: string;
  protected game: GameState;
  public lastTick: number;

  constructor(gamePos: GamePos, type: string, game: GameState) {
    this.pos = gamePos;
    this.AgentType = type;
    this.AgentID = Math.floor(100000000000000 * Math.random()).toString();
    this.lastTick = this.lastTick;
    this.game = game;
    this.game.getAgents().AddAgent(this);
  }

  abstract runAgent(interval: number): void;

  abstract draw(): void;

  public DeleteAgent() {
    this.game.getAgents().removeAgent(this.AgentID);
  }
}
