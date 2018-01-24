import { GamePos } from "./GamePos";

export class Agents {
  private static agents: AgentCollection;
  public static ctx: CanvasRenderingContext2D;
  public static lastTick: number;

  private constructor() {}

  public static init(canvas: HTMLCanvasElement) {
    Agents.ctx = canvas.getContext("2d");
    Agents.agents = {};
    this.lastTick = 0;
  }

  public static AddAgent(agent: Agent) {
    Agents.agents[agent.AgentID] = agent;
  }

  static removeAgent(id: string): void {
    delete Agents.agents[id];
  }

  public static runAgents(interval: number): void {
    Agents.lastTick += 1;
    console.log(Object.keys(Agents.agents).length);
    if (Object.keys(Agents.agents).length > 100) {
      Error('too many agents');
    }
    Object.keys(Agents.agents).forEach(k => {
      let agent = Agents.agents[k];
      if (agent.lastTick < Agents.lastTick) {
        agent.runAgent(interval);
      }
      agent.lastTick = Agents.lastTick;
    });
  }

  public static drawAgents() {
    Agents.ctx.beginPath();
    Agents.ctx.strokeStyle = "black";
    Agents.ctx.lineWidth = 1;

    Object.keys(Agents.agents).forEach(k => Agents.agents[k].draw());
    Agents.ctx.stroke();
  }
}

interface AgentCollection {
  [AgentID: string]: Agent;
}

export abstract class Agent {
  public pos: GamePos;
  readonly AgentType: string;
  readonly AgentID: string;
  public lastTick: number;

  constructor(gamePos: GamePos, type: string) {
    this.pos = gamePos;
    this.AgentType = type;
    this.AgentID = Math.floor(100000000000000 * Math.random()).toString();
    this.lastTick = Agents.lastTick;
  }

  abstract runAgent(interval: number): void;

  abstract draw(): void;

  public DeleteAgent() {
    Agents.removeAgent(this.AgentID);
  }
}
