import { Army } from "./Army";

export class Players {
    private players : PlayersCollection;

    constructor() { }

    public AddPlayer(player : Player) {
       this.players[player.getPlayerName()] = player;
    }

    public getPlayer(name : string) : Player {
        return this.players[name];
    }

}

interface PlayersCollection {
    [key : string] : Player;
}

export class Player {
    private playerName : string;
    private color : string;
    private attackStrategy : (army : Army) => void;

    constructor(name : string, color : string, strategy : (army : Army) => void) {
        this.playerName = name;
        this.attackStrategy = strategy;
        this.color = color;
    }

    public getStrategy() : (army : Army) => void {
        return this.attackStrategy;
    }

    public getPlayerName() : string {
        return this.playerName;
    }

    public getColor() : string {
        return this.color;
    }

    public equals(player : Player): boolean {
        return this.playerName === player.getPlayerName();
    }
}