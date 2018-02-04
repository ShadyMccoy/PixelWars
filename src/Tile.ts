import { GamePos } from './GamePos';
import { Army } from './Army';

export class Tile {
  readonly pos: GamePos;
  private width: number;
  private height: number;
  private ctx: CanvasRenderingContext2D;
  private armies : Army[];

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
    this.armies = new Array<Army>();
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

  public registerArmy(army: Army) : void {
    this.armies.push(army);
  }

  public resolveConflicts() : void {
    if (this.armies.length <= 1) { return; }
    let newArmies = new Array<Army>();
    let forces = new Forces();
    this.armies.forEach( a => {
      let force = forces[a.getPlayer()]
      if (force) {
        force.joinForces(a);
      } else {
        forces[a.getPlayer()] = a;
        newArmies.push(a);
      }
    });

    this.armies = newArmies;
  }
}

class Forces {
  [Player:string]: Army;
  
  constructor() {

  }
}
