import { Goal } from './Goal';
import { BackgroundMap } from './BackGroundCanvas';

export function runMain() {
	document.getElementById("p1").innerHTML = Goal.echo('ottO')
}

var bgm : BackgroundMap;
export function initCanvas(canvas : HTMLCanvasElement) {
	bgm = new BackgroundMap({ canvas: canvas});
}


export function animate() {
	bgm.drawMap();
}