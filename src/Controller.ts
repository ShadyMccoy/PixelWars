import { Tile } from './Tile';
import { BackgroundMap } from './BackGroundCanvas';
export class Controller {
    private bgm : BackgroundMap;
    private ctx : CanvasRenderingContext2D;
    private SelectedTile : Tile;
    private PreviousSelectedTile : Tile;
    
    constructor(bgm : BackgroundMap, ctx : HTMLCanvasElement) {
        this.bgm = bgm;
        this.ctx = ctx.getContext("2d");;
    }

    public drawController() {
        this.ctx.beginPath();
        if (this.PreviousSelectedTile) { 
            this.PreviousSelectedTile.clear();
            this.PreviousSelectedTile = null;
        }
        if (this.SelectedTile) { this.SelectedTile.drawSelection() }
        this.ctx.stroke();
    }

    
    public SelectTile(x : number, y : number) {
        if (this.SelectedTile) {
            this.PreviousSelectedTile = this.SelectedTile;
        }

        this.SelectedTile = new Tile(
            Math.floor(x/this.bgm.getTileWidth()),
            Math.floor(y/this.bgm.getTileHeight()),
            this.bgm.getTileWidth(),this.bgm.getTileHeight(),this.ctx);
    }
}