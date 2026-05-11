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
    attritionRate = 0.06,
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
    // Combat is staged across multiple ticks (see Tile.resolveConflicts).
    // combatModel controls the pressure curve fed into per-tick attrition:
    //   "lanchester" (default): pressure uses sum-of-squared enemy raw
    //     strengths, so a 2x ratio compounds (~4x damage advantage).
    //     Concentrating mass at the breakthrough still pays even under
    //     staged resolution.
    //   "linear": pressure uses raw enemy strength. Equal forces bleed
    //     at the same rate per tick; no nonlinear reward for overkill.
    this.combatModel = combatModel;
    // Per-tick attrition on contested tiles has two components:
    //   attritionRate × pressure  — percentage shaping. Larger stacks
    //     lose more absolute strength but the per-tick fraction is
    //     bounded, so a fair 6v6 still takes ~7 ticks at rate=0.06.
    //     This is the map-level "combat speed" knob — lower values
    //     mean longer-lived brackish zones; the UI surfaces it as
    //     the "Attrition" map setting.
    //   attritionFloor            — absolute per-tick raw-strength
    //     floor. Dominates when armies are small (a 1v1 dies in
    //     1–2 ticks); without it, small skirmishes would also drag
    //     for many ticks, which feels wrong — small fights should
    //     snap.
    // Net loss per side per tick (in raw-strength units) is then
    // scaled by enemy "causing losses" tech and divided by my "taking
    // losses" tech — see Tile.resolveConflicts.
    this.attritionRate = attritionRate;
    // Floor scales with rate so the "Attrition" map setting actually
    // moves the needle on long fights. With a flat 0.5 floor, lowering
    // the rate barely slowed fair 6v6s (the floor accounted for >half
    // the per-tick loss). Floor = 3 × rate keeps small fights snapping
    // (1v1 still resolves in 1–2 ticks) while letting big fights
    // brackish for much longer at low rates. Capped below at 0.1 so a
    // pathological rate=0 doesn't deadlock.
    this.attritionFloor = Math.max(0.1, attritionRate * 3);
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
    // Per-tick move queue. Strategies' army.attack() calls push entries
    // here during the act() phase; the engine drains them after every
    // army has acted. This is what makes moves simultaneous: no army
    // sees another army's outgoing move while deciding its own.
    this._pendingMoves = [];
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

  // Apply one queued move from the pending-moves drain. Deducts power
  // from the source army (and the source-tile budget in budget mode),
  // then spawns a fresh army on the destination. We spawn a new Army
  // even when a friendly already holds the destination — the same-player
  // merge happens in resolveConflicts via joinForces, which keeps this
  // path branch-free.
  _commitMove(m) {
    const army = m.army;
    if (!army || !army.alive) return;
    const power = m.power;
    if (!(power > 0)) return;
    if (army.strength - power < 0) return;
    army.strength -= power;
    if (this.movementModel === "budget" && m.work && m.srcTile) {
      const next = m.srcTile.budget - m.work;
      m.srcTile.budget = next > 0 ? next : 0;
    }
    const dest = m.destTile;
    if (!dest) return;
    const newArmy = new Army({
      pos: dest.pos,
      player: army.player,
      strength: power,
      game: this,
      maxStrength: this.maxArmy,
      tile: dest,
    });
    newArmy.bornAt = this.tick;
    this.armies.push(newArmy);
    const wasEmpty = dest.armies.length === 0;
    dest.registerArmy(newArmy);
    // Sticky holder update on arrival to an empty tile. Mirrors the
    // logic in spawnArmy (which _commitMove deliberately bypasses so
    // friendly-on-tile arrivals fold via resolveConflicts instead of
    // inline). Walking an empty tile that was previously held by
    // someone else is a conquest: flip holder and zero budget.
    if (wasEmpty) {
      if (dest._holderPid == null) {
        dest._holderPid = army.player.id;
      } else if (dest._holderPid !== army.player.id) {
        dest._holderPid = army.player.id;
        dest.budget = 0;
      }
    }
    if (dest.armies.length > 1 && !dest.dirty) {
      dest.dirty = true;
      this._dirtyTiles.push(dest);
    }
    this._territoryDirty = true;
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

    // Phase A: production. Grow strength and bank movement credit on
    // every living army. No strategy code runs here -- we want a fully
    // settled world before any army decides its move.
    const eligible = [];
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (!a.alive) continue;
      if (a.lastTick < tick) {
        a.runGrowth(interval, growth, decay);
        a.lastTick = tick;
      }
      if (a.canActThisTick()) eligible.push(a);
    }

    // Phase B: simultaneous decision. Shuffle the act order so equally-
    // valid same-tile targeting breaks ties uniformly at random instead
    // of by army-index. Each army's act() runs once and any attack()
    // calls only enqueue moves into _pendingMoves -- no strength deltas,
    // no tile.armies mutation. Bots see the start-of-tick world.
    const n = eligible.length;
    for (let i = n - 1; i > 0; i--) {
      const j = (this.rng() * (i + 1)) | 0;
      const t = eligible[i]; eligible[i] = eligible[j]; eligible[j] = t;
    }
    for (let i = 0; i < n; i++) {
      const a = eligible[i];
      if (!a.alive) continue;
      a.runAct();
    }

    // Phase C: commit queued moves. Deduct source strength and budget,
    // spawn one fresh attacker army per move on the destination tile.
    // No friendly fold-in here: same-player armies that arrive on the
    // same tile get merged in resolveConflicts, which preserves the
    // attacker bonus contribution from each contributor.
    const moves = this._pendingMoves;
    for (let i = 0; i < moves.length; i++) {
      this._commitMove(moves[i]);
    }
    moves.length = 0;
    for (let i = 0; i < eligible.length; i++) {
      const a = eligible[i];
      a._queuedSpend = 0;
      a._queuedWork = 0;
    }

    // Phase D: resolve combats on every tile that ended up with more
    // than one army.
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
    this._pendingMoves.length = 0;
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
