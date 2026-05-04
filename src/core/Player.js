let nextId = 1;

export class Player {
  constructor({ name, color, strategy, accent }) {
    this.id = nextId++;
    this.name = name;
    this.color = color;
    this.accent = accent ?? color;
    this.strategy = strategy;
    this.totals = { armies: 0, strength: 0, territory: 0 };
  }

  equals(other) {
    return other && other.id === this.id;
  }
}

export class Players {
  constructor() {
    this.byId = new Map();
    this.list = [];
  }

  add(player) {
    this.byId.set(player.id, player);
    this.list.push(player);
    return player;
  }

  remove(player) {
    this.byId.delete(player.id);
    this.list = this.list.filter((p) => p.id !== player.id);
  }

  resetTotals() {
    for (const p of this.list) {
      p.totals.armies = 0;
      p.totals.strength = 0;
      p.totals.territory = 0;
    }
  }
}
