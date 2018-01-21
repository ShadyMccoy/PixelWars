import { BackgroundMap } from "./BackGroundCanvas";
import { Map } from "./Map";
import { Tile, GamePos } from './Tile';

export class Agents {
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
}

export abstract class Agent {
  public pos: GamePos;
  constructor(gamePos: GamePos) {
    this.pos = gamePos;
  }

  abstract draw(
    x: number,
    y: number,
    width: number,
    height: number,
    ctx: CanvasRenderingContext2D
  ) : void;
}
