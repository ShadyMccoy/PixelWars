import { Map } from "./Map";
import { Tile, GamePos } from './Tile';

export class BackgroundMap {
  private static canvas: HTMLCanvasElement;
  private static map: Map;
  private static ctx: CanvasRenderingContext2D;
  private static selected: Tile;
  private static tiles: Tile[];

  private constructor() {}

  public static init(Values: Object) {
    Object.assign(BackgroundMap, Values);
    BackgroundMap.ctx = BackgroundMap.canvas.getContext("2d");
    BackgroundMap.ctx.globalAlpha = 1;
    BackgroundMap.tiles = new Array<Tile>();
    for (let h = 0; h < BackgroundMap.map.height; h++) {
      for (let w = 0; w < BackgroundMap.map.width; w++) {
        BackgroundMap.tiles.push(
          new Tile(
            new GamePos(w * BackgroundMap.map.width + h,w,h),
            BackgroundMap.getTileWidth(),
            BackgroundMap.getTileHeight(),
            BackgroundMap.ctx
          )
        );
      }
    }
  }

  public static resolveConflicts() {
    this.tiles.forEach( t => t.resolveConflicts() );
  }

  public static getAdjacentTile(pos: GamePos) : Tile {
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

    if (x < 0 || x > BackgroundMap.map.width) {
      x = pos.x;
    }
    
    if (y < 0 || y > BackgroundMap.map.height) {
      y = pos.y;
    }

    return BackgroundMap.getTileFromPos(new GamePos(-1, x, y));
  }

  public static getTileFromPos(pos: GamePos) : Tile {
    console.log('x: ' + pos.x + ', y: ' + pos.y);
    console.log(pos.x + (BackgroundMap.map.width * pos.y));
    return BackgroundMap.tiles[pos.x + (BackgroundMap.map.width * pos.y)];
  }

  public static getTile(idx: number): Tile {
    return BackgroundMap.tiles[idx];
  }

  public static drawMap() {
    BackgroundMap.ctx.beginPath();
    BackgroundMap.ctx.strokeStyle = "black";
    BackgroundMap.ctx.lineWidth = 1;

    BackgroundMap.tiles.forEach(t => t.draw());
    BackgroundMap.ctx.stroke();
  }

  public static drawSelected() {
    if (BackgroundMap.selected) {
      BackgroundMap.selected.draw();
    }
  }

  public static getTileWidth(): number {
    return BackgroundMap.canvas.width / BackgroundMap.map.width;
  }

  public static getTileHeight(): number {
    return BackgroundMap.canvas.height / BackgroundMap.map.height;
  }
}
