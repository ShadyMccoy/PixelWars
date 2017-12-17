import { BackgroundMap } from "./BackGroundCanvas";

export class Agents {
    private agents : Agent[];
    private bgm : BackgroundMap;
    private ctx : CanvasRenderingContext2D;
    constructor(backgroundMap : BackgroundMap, canvas : HTMLCanvasElement) {
        this.bgm = backgroundMap;
        this.ctx = canvas.getContext("2d");
    }
}

class Agent {

}