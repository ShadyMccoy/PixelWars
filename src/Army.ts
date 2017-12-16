import { Tile } from "./Tile";

export class Army {
    private strength : number;
    private player : string;

    constructor(strength : number, player : string) {
        
    }

    public attack(tile : Tile, power : number) {
        if (power > this.strength) { 
            power = this.strength;
        }

        this.strength -= power;
        tile.registerArmy(new Army(power,this.player));
    }

    public draw(x : number, y : number, width : number, height : number, ctx : CanvasRenderingContext2D) {
        ctx.arc(width*(x+0.5),height*(y+0.5),width/2,0,2*Math.PI);
    }
}