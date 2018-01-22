import { BackgroundMap } from './BackGroundCanvas';
import { GamePos } from './GamePos';

export class Agents {
  private static agents: Agent[];
  private static newAgents: Agent[];
  public static ctx: CanvasRenderingContext2D;

  private constructor() {}

  public static init(canvas: HTMLCanvasElement) {
    Agents.ctx = canvas.getContext("2d");
    Agents.agents = new Array<Agent>();
    Agents.newAgents = new Array<Agent>();
  }

  public static AddAgent(agent : Agent) {
    Agents.newAgents.push(agent);
    BackgroundMap.getTileFromPos(agent.pos).registerAgent(agent);
  }
  
  public static runAgents(interval : number) : void {
    Agents.agents = Agents.agents.concat(Agents.newAgents);
    console.log('Agents.agents.length: ' + Agents.agents.length);
    Agents.newAgents = new Array<Agent>();
    Agents.agents.forEach( a => {
      a.runAgent(interval);
    });
    Agents.agents = Agents.agents.concat(Agents.newAgents);
  }
  
  public static drawAgents() {
    Agents.ctx.beginPath();
    Agents.ctx.strokeStyle = "black";
    Agents.ctx.lineWidth = 1;

    Agents.agents.forEach( a => a.draw() );
    Agents.ctx.stroke();
  }
}

export abstract class Agent {
  public pos: GamePos;
   constructor(gamePos: GamePos) {
    this.pos = gamePos;
  }

  abstract runAgent(interval : number) : void;

  abstract draw(
  ) : void;
}
