//import { BackgroundMap } from './BackGroundCanvas';

export class GamePos {
    public id: number;
    public x: number;
    public y: number;
  
    constructor(id: number, x: number, y: number) {
      this.id = id;
      this.x = x;
      this.y = y;
    }

    public equals(pos : GamePos) :boolean {
      return this.x == pos.x && this.y == pos.y;
    }

    public directionTo(pos : GamePos): any {
      if (pos.x === this.x - 1) { return 0; }
      else if (pos.x === this.x + 1) { return 1; }
      else if (pos.y === this.x - 1) { return 2; }
      else if (pos.y === this.x + 1) { return 3; }
      else { return -1; } 
    }  
}
  