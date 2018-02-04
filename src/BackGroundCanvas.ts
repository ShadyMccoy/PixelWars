import { Map } from "./Map";
import { Tile } from './Tile';
import { GamePos } from './GamePos';

export class BackgroundMap {
  private canvas: HTMLCanvasElement;
  private map: Map;
  private ctx: CanvasRenderingContext2D;
  private selected: Tile;
  private tiles: Tile[];

  public constructor(Values: Object) {
    Object.assign(this, Values);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.globalAlpha = 1;
    this.tiles = new Array<Tile>();
    for (let h = 0; h < this.map.height; h++) {
      for (let w = 0; w < this.map.width; w++) {
        this.tiles.push(
          new Tile(
            new GamePos(w * this.map.width + h,w,h),
            this.getTileWidth(),
            this.getTileHeight(),
            this.ctx
          )
        );
      }
    }
  }

  public resolveConflicts() {
    this.tiles.forEach( t => t.resolveConflicts() );
  }

  public getAdjacentTile(pos: GamePos) : Tile {
    let randomNum = Math.random();
    let x = pos.x;
    let y = pos.y;
    if (randomNum < 0.25) { 
      x -= 1;
    } else if (randomNum < 0.5) {
      x += 1;
    } else if (randomNum < 0.75) { 
      y -= 1;
    } else if (randomNum < 1) {
      y += 1;
    }

    if (x < 0 || x > this.map.width) {
      x = pos.x;
    }
    
    if (y < 0 || y > this.map.height) {
      y = pos.y;
    }

    return this.getTileFromPos(new GamePos(-1, x, y));
  }

  public getTileFromPos(pos: GamePos) : Tile {
    return this.tiles[pos.x + (this.map.width * pos.y)];
  }

  public getTile(idx: number): Tile {
    return this.tiles[idx];
  }

  public drawMap() {
    this.ctx.beginPath();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 1;

    this.tiles.forEach(t => t.draw());
    this.ctx.stroke();
  }

  public drawSelected() {
    if (this.selected) {
      this.selected.draw();
    }
  }

  public getTileWidth(): number {
    return this.canvas.width / this.map.width;
  }

  public getTileHeight(): number {
    return this.canvas.height / this.map.height;
  }
}
