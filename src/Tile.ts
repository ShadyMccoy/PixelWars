import { Army } from './Army';

export class Tile {
    readonly x : number;
    readonly y : number;
    armies : Army[];

    constructor(x : number, y : number) {
        this.x = x;
        this.y = y;
    }

    public registerArmy(army : Army) {
        this.armies.push(army);
    }

    public clear(width : number, height : number, ctx : CanvasRenderingContext2D) {
        ctx.clearRect(width*this.x+1, height*this.y+1, width - 2, height -2);
    }

    public draw(width : number, height : number, isSelected : boolean, ctx : CanvasRenderingContext2D) {
        ctx.rect(width*this.x, height*this.y, width, height);
        ctx.rect

        if (!isSelected) { return; }
        ctx.rect(width*this.x + 5, height*this.y+5, width - 10, height -10);
        ctx.rect
    }
}