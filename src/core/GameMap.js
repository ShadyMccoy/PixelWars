import { GamePos } from "./GamePos.js";
import { Tile } from "./Tile.js";

const DIR_DX = [-1, 1, 0, 0];
const DIR_DY = [0, 0, -1, 1];

export class GameMap {
  constructor({ width, height, wrap = true }) {
    this.width = width;
    this.height = height;
    this.wrap = wrap;
    const tiles = new Array(width * height);
    this.tiles = tiles;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        tiles[y * width + x] = new Tile(new GamePos(x, y));
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = tiles[y * width + x];
        const n = t.neighbors;
        for (let d = 0; d < 4; d++) {
          n[d] = this.getTile(x + DIR_DX[d], y + DIR_DY[d]);
        }
      }
    }
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getTile(x, y) {
    const w = this.width;
    const h = this.height;
    if (this.wrap) {
      if (x < 0 || x >= w) x = ((x % w) + w) % w;
      if (y < 0 || y >= h) y = ((y % h) + h) % h;
    } else if (x < 0 || y < 0 || x >= w || y >= h) {
      return null;
    }
    return this.tiles[y * w + x];
  }

  normalize(x, y) {
    if (this.wrap) {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
      return { x, y };
    }
    return this.inBounds(x, y) ? { x, y } : null;
  }

  getTileFromPos(pos) {
    return this.getTile(pos.x, pos.y);
  }

  adjacent(pos, dir) {
    return this.getTile(pos.x + DIR_DX[dir], pos.y + DIR_DY[dir]);
  }

  neighbors(pos) {
    const t = this.getTile(pos.x, pos.y);
    if (!t) return [];
    const out = [];
    const n = t.neighbors;
    for (let i = 0; i < 4; i++) if (n[i]) out.push(n[i]);
    return out;
  }

  resolveConflicts(dirty) {
    if (dirty) {
      for (let i = 0; i < dirty.length; i++) {
        const t = dirty[i];
        t.dirty = false;
        t.resolveConflicts();
      }
      dirty.length = 0;
      return;
    }
    const tiles = this.tiles;
    for (let i = 0; i < tiles.length; i++) tiles[i].resolveConflicts();
  }

  forEachTile(fn) {
    const tiles = this.tiles;
    for (let i = 0; i < tiles.length; i++) fn(tiles[i]);
  }
}
