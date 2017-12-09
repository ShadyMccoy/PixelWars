import { Map } from './Map';

export class BackgroundMap {
    private canvas : HTMLCanvasElement;
    private map : Map;
    private CurrentView : MapView;
    private ctx: CanvasRenderingContext2D;

    constructor(Values : Object) {
        Object.assign(this,Values);
        this.ctx = this.canvas.getContext("2d");
    }

    public drawMap() {
        this.ctx.beginPath();
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 1;

        let tw = this.getTileWidth();
        let th = this.getTileHeight();
        for (let w=0; w<this.map.width; w++) {
            for (let h=0; h<this.map.height; h++) {
                this.ctx.rect(w*tw,h*th,tw,th);
            }
        }
        this.ctx.rect
        this.ctx.stroke();
    }

    private getTileWidth() : number {
        return this.canvas.width / this.map.width;
    }
    
    private getTileHeight() : number {
        return this.canvas.height / this.map.height;
    }
}

class MapView {
    public XPos : number;
    public YPos : number;
    public scale : number;
}