import { GameMap } from "./GameMap.js";
import { Army } from "./Army.js";
import { Players } from "./Player.js";
import { makeRng } from "./rng.js";

export class Game {
  constructor({
    width = 40,
    height = 30,
    wrap = true,
    growth = 1,
    maxArmy = 6,
    decay = 0.05,
    attackerBonus = 1.0,
    combatModel = "lanchester",
    movementModel = "classic",
    maxBudget = null,         // budget mode: cap. null -> defaults to maxArmy.
    baseBudgetRecharge = 1.0, // budget mode: budget gained per tick at neutral move-tech.
    maxHistory = 240,
    seed = null,
  } = {}) {
    this.map = new GameMap({ width, height, wrap });
    this.players = new Players();
    this.armies = [];
    this._deadCount = 0;
    this._dirtyTiles = [];
    this.tick = 0;
    this.elapsed = 0;
    this.growth = growth;
    this.maxArmy = maxArmy;
    this.decay = decay;
    // Legacy global multiplier for invader effective strength. Kept on
    // the Game object so bots that read game.attackerBonus for their
    // commit math don't crash, but default is now 1.0 — Lanchester's
    // square law produces the "concentrating force wins decisively"
    // dynamic that the flat 1.4 used to encode, and a staged-combat
    // perpetual bonus would make attackers absurdly strong.
    this.attackerBonus = attackerBonus;
    // "lanchester" (default): per-tick losses use sum-of-squared enemy
    //   effectives, so a 2x ratio compounds (~4x damage advantage) —
    //   shaping mass at the breakthrough pays.
    // "linear": losses use raw effective strength. Equal forces
    //   annihilate at the same rate, no nonlinear reward for overkill.
    this.combatModel = combatModel;
    // Per-tick attrition has two components on contested tiles:
    //   conflictAttritionRate × pressure  — percentage shaping. Large
    //     stacks lose more in absolute terms but still take ~5–6 ticks
    //     to resolve a fair 6v6, so a campaign visibly intermingles.
    //   conflictAttritionFloor             — absolute floor in effective
    //     units. Dominates when armies are small: a 1v1 dies in 1–2
    //     ticks (near-instant), a 2v2 in ~2–3 ticks. Without the floor,
    //     small skirmishes would also drag for ~5 ticks, which feels
    //     wrong — small fights should snap.
    // Net loss per side per tick (in effective units):
    //   min(myEff, rate*pressure + floor) / armyMult
    this.conflictAttritionRate = 0.15;
    this.conflictAttritionFloor = 0.5;
    // "classic" (default): adjacent-only attacks, garrison floor from
    //   the move tech. Existing 391 bots target this model.
    // "budget": tile-local movement budget recharges per tick (scaled
    //   by the owner's move-tech multiplier), measured in work units
    //   (strength × Euclidean distance). Attack targets can be any
    //   tile; the engine clamps actual delivered power so the
    //   work spent never exceeds the source tile's budget. Conquest
    //   resets the captured tile's budget to 0, which gives defenders
    //   a structural tempo advantage and makes blitz raids costly.
    this.movementModel = movementModel;
    this.maxBudget = maxBudget != null ? maxBudget : maxArmy;
    this.baseBudgetRecharge = baseBudgetRecharge;
    this.history = [];
    this.maxHistory = maxHistory;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.eventBus = typeof EventTarget !== "undefined" ? new EventTarget() : null;
    this._territoryDirty = true;
    this.recentMoves = [];
    this.moveFadeTicks = 8;
    // Recently-resolved combats, used by the renderer to paint a red
    // residue on contested tiles. magnitude = total strength engaged
    // in the fight; the renderer fades alpha with age and scales by
    // magnitude so heavy/sustained conflicts read as deeper red.
    this.recentConflicts = [];
    this.conflictFadeTicks = 45;
  }

  recordConflict(tile, magnitude) {
    if (!tile || !(magnitude > 0)) return;
    this.recentConflicts.push({
      x: tile.pos.x,
      y: tile.pos.y,
      magnitude,
      tick: this.tick,
    });
  }

  recordMove(fromTile, toTile, player, power) {
    if (!fromTile || !toTile) return;
    let dx = toTile.pos.x - fromTile.pos.x;
    let dy = toTile.pos.y - fromTile.pos.y;
    const w = this.map.width;
    const h = this.map.height;
    if (dx > 1) dx -= w;
    else if (dx < -1) dx += w;
    if (dy > 1) dy -= h;
    else if (dy < -1) dy += h;
    this.recentMoves.push({
      x: fromTile.pos.x,
      y: fromTile.pos.y,
      dx,
      dy,
      color: player.color,
      accent: player.accent,
      power,
      tick: this.tick,
    });
  }

  on(event, fn) {
    this.eventBus?.addEventListener(event, fn);
  }

  emit(event, detail) {
    if (!this.eventBus || typeof CustomEvent === "undefined") return;
    this.eventBus.dispatchEvent(new CustomEvent(event, { detail }));
  }

  addPlayer(player) {
    this.players.add(player);
    this.emit("players:changed", { players: this.players.list });
    return player;
  }

  removePlayer(player) {
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (a.alive && a.player.equals(player)) a.die();
    }
    this.players.remove(player);
    this.emit("players:changed", { players: this.players.list });
  }

  spawnArmy(army, tile) {
    // Engine invariant: at most one alive army per (tile, player). If a
    // friendly already holds the tile, fold strength into it rather than
    // adding a duplicate. Keeps tile.armies bounded by player count and
    // prevents Trinity-style stacking regardless of strategy choice.
    const existing = tile.armies;
    const pid = army.player.id;
    for (let i = 0; i < existing.length; i++) {
      const other = existing[i];
      if (other.alive && other.player.id === pid) {
        let s = other.strength + army.strength;
        const max = other.maxStrength;
        if (s > max) s = max;
        other.strength = s;
        army.alive = false;
        army.tile = null;
        this._territoryDirty = true;
        return other;
      }
    }
    this.armies.push(army);
    army.tile = tile;
    const wasEmpty = tile.armies.length === 0;
    tile.registerArmy(army);
    // Sticky holder update on arrival to an empty tile:
    //   - first-ever occupant -> seed holder
    //   - returning holder    -> no change (no conquest)
    //   - new player walking into an abandoned/cleared tile -> conquest:
    //     flip holder and zero the per-tile budget (mirrors the
    //     budget reset that resolveConflicts performs on a forced flip).
    if (wasEmpty) {
      if (tile._holderPid == null) {
        tile._holderPid = army.player.id;
      } else if (tile._holderPid !== army.player.id) {
        tile._holderPid = army.player.id;
        tile.budget = 0;
      }
    }
    if (tile.armies.length > 1 && !tile.dirty) {
      tile.dirty = true;
      this._dirtyTiles.push(tile);
    }
    this._territoryDirty = true;
    return army;
  }

  placeArmy({ x, y, player, strength = 1 }) {
    const tile = this.map.getTile(x, y);
    if (!tile) return null;
    const army = new Army({
      pos: tile.pos,
      player,
      strength,
      game: this,
      maxStrength: this.maxArmy,
      tile,
    });
    this.spawnArmy(army, tile);
    return army;
  }

  removeArmy(army) {
    this._deadCount++;
    this._territoryDirty = true;
  }

  step(interval) {
    this.tick++;
    this.elapsed += interval;
    const armies = this.armies;
    const tick = this.tick;
    const growth = this.growth;
    const decay = this.decay;
    // Shuffle the iteration order over pre-existing armies each tick.
    // Within-tick semantics are sequential (an army's attack commits
    // immediately and is visible to later armies), so deterministic
    // iteration order gave lower-index players a structural advantage
    // on contested empty tiles. Shuffling removes the persistent slot
    // bias while keeping per-seed determinism. Armies spawned during
    // this tick (appended to `armies` by `attack`) are still visited
    // afterward in append order — that cascade behavior is unchanged.
    const n = armies.length;
    const order = new Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = (this.rng() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let oi = 0; oi < n; oi++) {
      const a = armies[order[oi]];
      if (!a.alive) continue;
      if (a.lastTick < tick) {
        a.run(interval, growth, decay);
        a.lastTick = tick;
      }
    }
    for (let i = n; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive) continue;
      if (a.lastTick < tick) {
        a.run(interval, growth, decay);
        a.lastTick = tick;
      }
    }
    this.map.resolveConflicts(this._dirtyTiles);

    // Budget mode: each owned tile recharges its movement budget by
    // baseRecharge × owner.move-tech-multiplier, capped at maxBudget.
    // Tiles without an army (neutral) are skipped — their budget was
    // already reset to 0 on whatever conquest left them empty, and
    // there's no owner to define the recharge rate. Done after combat
    // resolution so just-conquered tiles (budget=0) don't sneak in a
    // free recharge tick before the new owner has acted.
    if (this.movementModel === "budget") {
      const baseRate = this.baseBudgetRecharge * interval * 30; // tickInterval is 1/30 by default; normalize to ~1 per tick.
      const baseCap = this.maxBudget;
      const tiles = this.map.tiles;
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const armies = tile.armies;
        if (armies.length !== 1) continue;
        const owner = armies[0].player;
        // Move tech multiplies BOTH recharge rate AND budget cap. A
        // high-move tile fills faster *and* holds more, so the
        // archetype scales coherently — quick small jabs recover
        // their work fast, while a saved-up alpha strike can also
        // be larger. Cap is owner-dependent: when a tile changes
        // hands, the new ceiling is set by the new owner's tech
        // (the budget itself was just reset to 0 in resolveConflicts
        // and will climb to the new cap from there).
        const mult = owner?.techMults?.moveRecharge ?? 1;
        const cap = baseCap * mult;
        const next = tile.budget + baseRate * mult;
        tile.budget = next > cap ? cap : next;
      }
    }

    if (this.recentMoves.length > 0) {
      const moves = this.recentMoves;
      const cutoff = tick - this.moveFadeTicks;
      let w = 0;
      for (let i = 0; i < moves.length; i++) {
        if (moves[i].tick > cutoff) moves[w++] = moves[i];
      }
      moves.length = w;
    }

    if (this.recentConflicts.length > 0) {
      const conflicts = this.recentConflicts;
      const cutoff = tick - this.conflictFadeTicks;
      let w = 0;
      for (let i = 0; i < conflicts.length; i++) {
        if (conflicts[i].tick > cutoff) conflicts[w++] = conflicts[i];
      }
      conflicts.length = w;
    }

    if (this._deadCount > 32 && this._deadCount * 4 > armies.length) {
      this._compactArmies();
    }

    this.recomputeStrengthTotals();
    if (this.maxHistory > 0) this.recordHistory();
  }

  stepBatch(count, interval) {
    for (let i = 0; i < count; i++) this.step(interval);
  }

  _compactArmies() {
    const a = this.armies;
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i].alive) a[w++] = a[i];
    }
    a.length = w;
    this._deadCount = 0;
  }

  recomputeStrengthTotals() {
    const list = this.players.list;
    for (let i = 0; i < list.length; i++) {
      const t = list[i].totals;
      t.armies = 0;
      t.strength = 0;
    }
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive) continue;
      const t = a.player.totals;
      t.armies++;
      t.strength += a.strength;
    }
  }

  recomputeTerritory() {
    const list = this.players.list;
    for (let i = 0; i < list.length; i++) list[i].totals.territory = 0;
    const tiles = this.map.tiles;
    for (let i = 0; i < tiles.length; i++) {
      // ownerArmy() returns the strongest occupant. On contested tiles
      // this attributes territory to the current holder rather than to
      // whichever army happens to be at armies[0].
      const owner = tiles[i].ownerArmy();
      if (owner) owner.player.totals.territory++;
    }
    this._territoryDirty = false;
  }

  recomputeTotals() {
    this.recomputeStrengthTotals();
    this.recomputeTerritory();
  }

  recordHistory() {
    if (this._territoryDirty) this.recomputeTerritory();
    const sample = { t: this.elapsed };
    const terr = {};
    const list = this.players.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      sample[p.id] = p.totals.strength;
      terr[p.id] = p.totals.territory;
    }
    sample.terr = terr;
    this.history.push(sample);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  reset() {
    const armies = this.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (a.alive) a.die();
    }
    this.armies.length = 0;
    this._deadCount = 0;
    this._dirtyTiles.length = 0;
    this.recentMoves.length = 0;
    this.recentConflicts.length = 0;
    this.tick = 0;
    this.elapsed = 0;
    this.history.length = 0;
    const tiles = this.map.tiles;
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].armies.length = 0;
      tiles[i].dirty = false;
      tiles[i]._holderPid = null;
      tiles[i].budget = 0;
    }
    this._territoryDirty = true;
  }

  livingPlayers() {
    return this.players.list.filter((p) => p.totals.armies > 0);
  }
}
