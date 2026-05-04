import { GamePos } from "./GamePos.js";
import { Tile } from "./Tile.js";

export class GameMap {
  constructor({ width, height, wrap = true }) {
    this.width = width;
    this.height = height;
    this.wrap = wrap;
    this.tiles = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.tiles[this.index(x, y)] = new Tile(new GamePos(x, y));
      }
    }
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  normalize(x, y) {
    if (this.wrap) {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
      return { x, y };
    }
    return this.inBounds(x, y) ? { x, y } : null;
  }

  getTile(x, y) {
    const n = this.normalize(x, y);
    if (!n) return null;
    return this.tiles[this.index(n.x, n.y)];
  }

  getTileFromPos(pos) {
    return this.getTile(pos.x, pos.y);
  }

  adjacent(pos, dir) {
    const offsets = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    const [dx, dy] = offsets[dir];
    return this.getTile(pos.x + dx, pos.y + dy);
  }

  neighbors(pos) {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const t = this.adjacent(pos, i);
      if (t) out.push(t);
    }
    return out;
  }

  resolveConflicts() {
    for (const t of this.tiles) t.resolveConflicts();
  }

  forEachTile(fn) {
    for (const t of this.tiles) fn(t);
  }
}
