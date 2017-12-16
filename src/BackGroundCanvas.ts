import { Map } from './Map';
import { Tile } from './Tile';
import { Army } from './Army';

export class BackgroundMap {
    private canvas : HTMLCanvasElement;
    private map : Map;
    private CurrentView : MapView;
    private ctx: CanvasRenderingContext2D;
    private selected : Tile;
    private tiles : Tile[];
    
    constructor(Values : Object) {
        Object.assign(this,Values);
        this.ctx = this.canvas.getContext("2d");
        this.ctx.globalAlpha = 1;
        this.tiles = new Array<Tile>();
        for (let w=0; w<this.map.width; w++) {
            for (let h=0; h<this.map.height; h++) {
                this.tiles.push(new Tile(w,h));
            }
        }

        this.tiles[7].registerArmy(new Army(4,'Player1'));
    }

    public drawMap() {
        this.ctx.beginPath();
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 1;

        let tw = this.getTileWidth();
        let th = this.getTileHeight();
        this.tiles.forEach( t => t.draw(tw,th,false,this.ctx) );
        this.ctx.stroke();
    }

    public drawSelected() {
        if (this.selected) { 
            this.selected.draw(this.getTileWidth(),this.getTileHeight(),true,this.ctx);
        }

    }

    private getTileWidth() : number {
        return this.canvas.width / this.map.width;
    }
    
    private getTileHeight() : number {
        return this.canvas.height / this.map.height;
    }

    public SelectTile(x : number, y : number) {
        if (this.selected) {
            this.selected.clear(this.getTileWidth(),this.getTileHeight(),this.ctx);
        }

        this.selected = new Tile(
            Math.floor(x/this.getTileWidth()),
            Math.floor(y/this.getTileHeight()));
    }

}

class MapView {
    public XPos : number;
    public YPos : number;
    public scale : number;
}