import { Agent } from "./Agents";
import { GamePos } from "./GamePos";
import { Tile } from "./Tile";
import { GameState } from "./GameState";

let MAX_ARMY_SIZE = 5.3;

export class Army extends Agent {
  private strength: number;
  private player: string;

  constructor(pos: GamePos, strength: number, player: string, game: GameState) {
    super(pos, "Army", game);
    this.pos = pos;
    this.strength = strength;
    this.player = player;
  }

  public getPlayer(): string {
    return this.player;
  }

  public getStrength(): number {
    return this.strength;
  }

  public FightArmy(ArmyStrength: number): void {
    this.strength -= ArmyStrength;
  }

  public joinForces(army: Army) {
    this.strength += army.getStrength();
    army.DeleteAgent();
  }

  public attack(tile: Tile, power: number) {
    if (tile === undefined) {
      return;
    }
    if (this.pos.equals(tile.pos)) {
      return;
    }
    if (power <= 0.5) {
      return;
    }
    if (this.strength - power < 1) {
      return;
    }

    this.strength -= power;
    let newArmy = new Army(tile.pos, power, this.player, this.game);
    this.game
      .getBackground()
      .getTileFromPos(tile.pos)
      .registerArmy(newArmy);
  }

  public runAgent(interval: number): void {
    this.strength += interval;
    if (this.strength > MAX_ARMY_SIZE) {
      this.strength = MAX_ARMY_SIZE;
    }

    if (this.player == "Player1") {
      let tile = this.getWeakestAdjacentTile();
      let enemyArmies = tile.getArmies();
      
      let enemyStrength = this.getArmiesStrength(enemyArmies);

      if (enemyArmies.length > 0 && enemyArmies[0].player == this.player) {
        this.attack(tile, this.strength - (this.strength + enemyStrength) / 2);
        return;
      }

      if (enemyStrength + 1 < this.strength) {
        this.attack(tile, this.strength - 1);
      }
    }
    else {
      this.attack(this.game.getBackground().getRandomAdjacentTile(this.pos),Math.random() * this.strength);
    }
  }

  private getWeakestAdjacentTile(): Tile {
    let bgm = this.game.getBackground();
    let tile1 = bgm.getAdjacentTile(this.pos, 0);
    let tile2 = bgm.getAdjacentTile(this.pos, 1);
    if (
      !tile1.equals(tile2) &&
      this.getArmiesStrength(tile1.getArmies()) >
        this.getArmiesStrength(tile2.getArmies())
    ) {
      tile1 = tile2;
    }

    tile2 = bgm.getAdjacentTile(this.pos, 2);
    if (
      !tile1.equals(tile2) &&
      this.getArmiesStrength(tile1.getArmies()) >
        this.getArmiesStrength(tile2.getArmies())
    ) {
      tile1 = tile2;
    }

    tile2 = bgm.getAdjacentTile(this.pos, 3);
    if (
      !tile1.equals(tile2) &&
      this.getArmiesStrength(tile1.getArmies()) >
        this.getArmiesStrength(tile2.getArmies())
    ) {
      tile1 = tile2;
    }

    return tile1;
  }

  private getArmiesStrength(armies: Army[]): number {
    let strength = 0;
    armies.forEach(a => (strength += a.getStrength()));
    return strength;
  }

  public draw(): void {
    let map = this.game.getBackground();
    let width = map.getTileWidth() * this.strength / MAX_ARMY_SIZE;
    let height = map.getTileHeight() * this.strength / MAX_ARMY_SIZE;

    let x = map.getTileWidth() * (this.pos.x + 0.5) - width / 2;
    let y = map.getTileHeight() * (this.pos.y + 0.5) - height / 2;
    let ctx = this.game.getAgents().ctx;

    ctx.beginPath();
    if (this.player == "Player1") {
      ctx.strokeStyle = "red";
    } else {
      ctx.strokeStyle = "blue";
    }
    ctx.rect(x, y, width, height);
    ctx.stroke();
  }
}
