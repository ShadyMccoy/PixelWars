import { NEUTRAL_TECH, techToMultipliers } from "./Tech.js";

let nextId = 1;

export class Player {
  constructor({ name, color, strategy, accent, tech }) {
    this.id = nextId++;
    this.name = name;
    this.color = color;
    this.accent = accent ?? color;
    this.strategy = strategy;
    this.totals = { armies: 0, strength: 0, territory: 0 };
    this.tech = tech ?? { ...NEUTRAL_TECH };
    this.techMults = techToMultipliers(this.tech);
    // Convenience: minimum garrison an attacking army must leave at
    // its source tile, derived from the move tech. Strategies use it
    // via army.attackPower; the engine enforces it in isAttackValid.
    this.minGarrison = this.techMults.move;
    // Active player orders (move/etc) for the bot-command system. Each
    // tick the engine expands these into per-army _pendingMoves entries
    // and decrements ttl; expired orders are dropped automatically.
    // Bots that implement the plan(game, player) API mutate this list
    // via game.issueOrder / game.cancelOrder; bots that only have the
    // legacy act(army, game) callback never touch it.
    this.orders = [];
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
