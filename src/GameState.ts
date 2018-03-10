import { BackgroundMap } from './BackGroundCanvas';
import { Controller } from './Controller';
import { Agents } from './Agents';
import { Players, Player } from './Player';

export class GameState {
    private agents?: Agents;
    private background?: BackgroundMap;
    private controller?: Controller;
    private players?: Players;

    constructor() {
        
    }

    public createController(UIController: HTMLCanvasElement) : void {
        if (this.controller) { throw Error('Duplicated controller'); }
        this.controller = new Controller(UIController,this);
    }

    public getController() : Controller {
        return this.controller;
    }

    public createBackground(values: Object) : void {
        if (this.background) { throw Error('Duplicate background.'); }
        this.background = new BackgroundMap(values);
    }

    public getBackground() : BackgroundMap {
        return this.background;
    }

    public createAgents(UIAgents: HTMLCanvasElement) : void {
        if (this.agents) { throw Error('Duplicate agents'); }
        this.agents = new Agents(UIAgents);
    }

    public getAgents() : Agents {
        return this.agents;
    }

    public createPlayers() : void {
        if (this.players) { throw Error('Duplicate players collections in game state'); }
        this.players = new Players();
    }

    public AddPlayer(player : Player) : void {
        this.players.AddPlayer(player);
    }

    public getPlayers() : Players {
        return this.players;
    }

    public getPlayer(name : string) : Player {
        return this.players.getPlayer(name);
    }
}