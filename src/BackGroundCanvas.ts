import { Map } from "./Map";
import { Tile, GamePos } from './Tile';

export class BackgroundMap {
  private canvas: HTMLCanvasElement;
  private map: Map;
  private CurrentView: MapView;
  private ctx: CanvasRenderingContext2D;
  private selected: Tile;
  private tiles: Tile[];

  constructor(Values: Object) {
    Object.assign(this, Values);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.globalAlpha = 1;
    this.tiles = new Array<Tile>();
    for (let h = 0; h < this.map.height; h++) {
      for (let w = 0; w < this.map.width; w++) {
        this.tiles.push(
          new Tile(
            { id: w * this.map.width + h, x: w, y: h },
            this.getTileWidth(),
            this.getTileHeight(),
            this.ctx
          )
        );
      }
    }
  }

  public getTileFromPos(pos: GamePos) {
    console.log('x: ' + pos.x + ', y: ' + pos.y);
    console.log(pos.x + (this.map.width * pos.y));
    return this.tiles[pos.x + (this.map.width * pos.y)];
  }

  public getTile(idx: number): Tile {
    return this.tiles[idx];
  }

  public drawMap() {
    this.ctx.beginPath();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 1;

    let tw = this.getTileWidth();
    let th = this.getTileHeight();
    this.tiles.forEach(t => t.draw());
    this.ctx.stroke();
    this.tiles.forEach(t => t.drawArmies());
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

class MapView {
  public XPos: number;
  public YPos: number;
  public scale: number;
}
