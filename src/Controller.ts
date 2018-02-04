import { Tile } from './Tile';
import { GamePos } from "./GamePos";
import { BackgroundMap } from "./BackGroundCanvas";

export class Controller {
  private static ctx: CanvasRenderingContext2D;
  private static SelectedTile: Tile;
  private static PreviousSelectedTile: Tile;

  private constructor() {}

  public static init(ctx: HTMLCanvasElement) {
    Controller.ctx = ctx.getContext("2d");
  }

  public static drawController() {
    Controller.ctx.beginPath();
    if (Controller.PreviousSelectedTile) {
      Controller.PreviousSelectedTile.clear();
      Controller.PreviousSelectedTile = null;
    }
    if (Controller.SelectedTile) {
      Controller.SelectedTile.drawSelection();
    }
    Controller.ctx.stroke();
  }

  public static SelectTile(x: number, y: number) {
    if (Controller.SelectedTile) {
      Controller.PreviousSelectedTile = Controller.SelectedTile;
    }

    Controller.SelectedTile = new Tile(
      new GamePos(
        -1,
        Math.floor(x / BackgroundMap.getTileWidth()),
        Math.floor(y / BackgroundMap.getTileHeight())),
      BackgroundMap.getTileWidth(),
      BackgroundMap.getTileHeight(),
      Controller.ctx
    );
  }
}
