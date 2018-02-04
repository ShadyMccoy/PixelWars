import { BackgroundMap } from './BackGroundCanvas';
import { Controller } from './Controller';
import { Agents } from './Agents';

export class GameState {
    private agents?: Agents;
    private background?: BackgroundMap;
    private controller?: Controller;

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
        this.agents = new Agents(UIAgents,this);
    }

    public getAgents() {
        return this.agents;
    }
}