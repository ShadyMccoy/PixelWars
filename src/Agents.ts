import { BackgroundMap } from "./BackGroundCanvas";
import { Map } from "./Map";
import { Tile } from "./Tile";
import { Army } from "./Army";

export class Agents {
  private agents: Agent[];
  private bgm: BackgroundMap;
  private ctx: CanvasRenderingContext2D;
  constructor(backgroundMap: BackgroundMap, canvas: HTMLCanvasElement) {
    this.bgm = backgroundMap;
    this.ctx = canvas.getContext("2d");

    this.agents = new Array<Agent>();

    let army1 = new Army(this.bgm.getTile(7).pos, 5, "Player1");
    this.agents.push(army1);
  }
}

export class Agent {}
