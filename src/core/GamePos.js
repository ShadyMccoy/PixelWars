export class GamePos {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  equals(other) {
    return other && this.x === other.x && this.y === other.y;
  }

  directionTo(other) {
    if (other.x === this.x - 1 && other.y === this.y) return 0;
    if (other.x === this.x + 1 && other.y === this.y) return 1;
    if (other.y === this.y - 1 && other.x === this.x) return 2;
    if (other.y === this.y + 1 && other.x === this.x) return 3;
    return -1;
  }
}

export const DIRS = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];
