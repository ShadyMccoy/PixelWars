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
}