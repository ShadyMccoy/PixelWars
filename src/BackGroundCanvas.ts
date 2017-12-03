export class BackgroundMap {
    private canvas : HTMLCanvasElement;
    private CurrentView : MapView;
    private ctx: CanvasRenderingContext2D;

    constructor(Values : Object) {
        Object.assign(this,Values);
        this.ctx = this.canvas.getContext("2d");
    }

    public drawMap() {
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, 1280, 720);
        this.ctx.beginPath();
        this.ctx.strokeStyle = "red";
        this.ctx.lineWidth = 5;
        this.ctx.arc(100, 100, 100, 0, 2 * Math.PI);
        this.ctx.stroke();
    }
}

class MapView {
    public XPos : number;
    public YPos : number;
    public scale : number;
}