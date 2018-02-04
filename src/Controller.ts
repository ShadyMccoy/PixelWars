import { Tile } from './Tile';
import { GamePos } from "./GamePos";
import { GameState } from './GameState';

export class Controller {
  private ctx: CanvasRenderingContext2D;
  private SelectedTile: Tile;
  private PreviousSelectedTile: Tile;
  private game: GameState;

  public constructor(ctx: HTMLCanvasElement, game: GameState) {
    this.ctx = ctx.getContext("2d");
    this.game = game;
  }

  public drawController() {
    this.ctx.beginPath();
    if (this.PreviousSelectedTile) {
      this.PreviousSelectedTile.clear();
      this.PreviousSelectedTile = null;
    }
    if (this.SelectedTile) {
      this.SelectedTile.drawSelection();
    }
    this.ctx.stroke();
  }

  public SelectTile(x: number, y: number) {
    if (this.SelectedTile) {
      this.PreviousSelectedTile = this.SelectedTile;
    }

    this.SelectedTile = new Tile(
      new GamePos(
        -1,
        Math.floor(x / this.game.getBackground().getTileWidth()),
        Math.floor(y / this.game.getBackground().getTileHeight())),
      this.game.getBackground().getTileWidth(),
      this.game.getBackground().getTileHeight(),
      this.ctx
    );
  }
}
