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
    let TileId = 0;
    for (let h = 0; h < this.map.height; h++) {
      for (let w = 0; w < this.map.width; w++) {
        this.tiles.push(
          new Tile(
            new GamePos(TileId,w,h),
            this.getTileWidth(),
            this.getTileHeight(),
            this.ctx
          )
        );
        TileId++;
      }
    }
  }

  public resolveConflicts() {
    this.tiles.forEach( t => t.resolveConflicts() );
  }

  public getRandomAdjacentTile(pos: GamePos) : Tile {
    let randomNum = Math.random();
    return this.getAdjacentTile(pos,randomNum*4);
  }

  public EnsureValidTileFromPos(pos : GamePos) : Tile {
    pos.x = ((pos.x % this.map.width) + this.map.width) % this.map.width;
    pos.y = ((pos.y % this.map.height) + this.map.height) % this.map.height;
    return this.getTileFromPos(pos);
  }

  public getAdjacentTile(pos: GamePos, idx : number) : Tile {
    let x = pos.x;
    let y = pos.y;
    if (idx < 1) { 
      x -= 1;
    } else if (idx < 2) {
      x += 1;
    } else if (idx < 3) { 
      y -= 1;
    } else if (idx < 4) {
      y += 1;
    }

    return this.EnsureValidTileFromPos(new GamePos(-1, x, y));
  }

  public getTileFromPos(pos: GamePos) : Tile {
    return this.tiles[pos.x + (this.map.width * pos.y)];
  }

  public getTile(idx: number): Tile {
    return this.tiles[idx];
  }

  public drawMap() {
    if (this.map.width > 10) { return; } 
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
