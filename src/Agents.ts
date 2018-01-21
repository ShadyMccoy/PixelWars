import { BackgroundMap } from "./BackGroundCanvas";
import { Map } from "./Map";
import { Tile, GamePos } from './Tile';
import { runMain } from './main';

export class Agents {
  private MAX_TICK_RATE = 100;
  private lastTick : Date;
  private agents: Agent[];
  private bgm: BackgroundMap;
  private ctx: CanvasRenderingContext2D;
  constructor(backgroundMap: BackgroundMap, canvas: HTMLCanvasElement) {
    this.bgm = backgroundMap;
    this.ctx = canvas.getContext("2d");

    this.agents = new Array<Agent>();
  }

  public AddAgent(agent : Agent) {
    this.agents.push(agent);
    this.bgm.getTileFromPos(agent.pos).registerAgent(agent);
  }
  
  public runAgents(interval : number) : void {
    this.agents.forEach( a => {
      a.runAgent(interval, this.bgm);
    })
  }

  
  public drawAgents() {
    this.ctx.beginPath();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 1;

    let tw = this.bgm.getTileWidth();
    let th = this.bgm.getTileHeight();
    this.agents.forEach( a => a.draw(tw,th,this.ctx) );
    this.ctx.stroke();
  }

}

export abstract class Agent {
  public pos: GamePos;
  constructor(gamePos: GamePos) {
    this.pos = gamePos;
  }

  abstract runAgent(interval : number, bgm: BackgroundMap) : void;

  abstract draw(
    width: number,
    height: number,
    ctx: CanvasRenderingContext2D
  ) : void;
}
