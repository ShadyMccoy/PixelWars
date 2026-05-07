// Client-side read-only mirror of the engine. Snapshots from the
// EngineHost get applied here; the Renderer / HUD / charts read this
// view exactly the way they used to read a live `Game` instance, so
// they stay engine-agnostic.
//
// This module deliberately does not import `src/core/*`. The engine
// runs in a worker; everything that crosses the boundary is plain
// data. View objects are persistent (keyed by id) so per-render state
// like Renderer.bornAt animation timestamps survives across snapshots.

class TileView {
  constructor(x, y) {
    this.pos = { x, y };
    this.armies = [];
    // Overlay code (Renderer.drawStrategyOverlay) walks neighbors. The
    // engine populates this lazily on first need; until then overlay
    // tiles fall back to silent skip.
    this.neighbors = [null, null, null, null];
  }

  ownerArmy() {
    return this.armies.length > 0 ? this.armies[0] : null;
  }
}

class PlayerView {
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name;
    this.color = spec.color;
    this.accent = spec.accent;
    this.strategy = spec.strategy;
    this.tech = spec.tech;
    this.techMults = spec.techMults;
    this.totals = { ...spec.totals };
  }

  equals(other) {
    return !!other && other.id === this.id;
  }
}

class ArmyView {
  constructor(id) {
    this.id = id;
    this.alive = true;
    this.pos = { x: 0, y: 0 };
    this.strength = 0;
    this.maxStrength = 1;
    this.player = null;
    this.tile = null;
    this.bornAt = 0;
  }
}

class MapView {
  constructor(width, height, wrap) {
    this.width = width;
    this.height = height;
    this.wrap = wrap;
    this.tiles = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.tiles[y * width + x] = new TileView(x, y);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = this.tiles[y * width + x];
        const n = t.neighbors;
        n[0] = this.getTile(x - 1, y);
        n[1] = this.getTile(x + 1, y);
        n[2] = this.getTile(x, y - 1);
        n[3] = this.getTile(x, y + 1);
      }
    }
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

  getTileFromPos(pos) {
    return this.getTile(pos.x, pos.y);
  }
}

export class GameView {
  constructor() {
    this.tick = 0;
    this.elapsed = 0;
    this.map = new MapView(1, 1, false);
    this.players = { list: [], byId: new Map() };
    this.armies = [];
    this.recentMoves = [];
    this.moveFadeTicks = 8;
    this.history = [];
    // Toggled by the renderer's territory check; safe to leave false
    // since the worker recomputes territory before each snapshot.
    this._territoryDirty = false;
    // Strategy-overlay plan caches mirror the live engine: the
    // renderer reads `view[`${prefix}${pid}`]`. The set of currently-
    // installed keys is tracked so we can drop stale ones when
    // overlay is toggled off or a player no longer has a plan.
    this._planKeys = new Set();
    this._armiesById = new Map();
    this._listeners = new Map();
  }

  on(event, fn) {
    let arr = this._listeners.get(event);
    if (!arr) {
      arr = [];
      this._listeners.set(event, arr);
    }
    arr.push(fn);
  }

  emit(event, detail) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const evt = { detail };
    for (const fn of arr) fn(evt);
  }

  // No-op on the client: the engine recomputes territory before
  // serializing each snapshot, so totals.territory is always current.
  recomputeTerritory() {
    this._territoryDirty = false;
  }

  livingPlayers() {
    return this.players.list.filter((p) => p.totals.armies > 0);
  }

  // ------------------------------------------------------------------
  // Snapshot application: keep view objects stable across ticks so
  // Renderer-side state (army.bornAt) persists. Players reset on
  // applyPlayers, armies reset/rebuild on applySnapshot.
  // ------------------------------------------------------------------

  applyMap(width, height, wrap) {
    // A new match invalidates every prior army. Clear them up front so
    // a render cycle between init and the first snapshot doesn't see
    // armies whose player ref was just nulled by applyPlayers.
    this.armies = [];
    this._armiesById.clear();
    this.recentMoves = [];
    this.history = [];
    if (this.map.width === width && this.map.height === height && this.map.wrap === wrap) {
      for (const t of this.map.tiles) t.armies.length = 0;
      return;
    }
    this.map = new MapView(width, height, wrap);
  }

  applyPlayers(playersData) {
    const list = [];
    const byId = new Map();
    for (const p of playersData) {
      const view = new PlayerView(p);
      list.push(view);
      byId.set(view.id, view);
    }
    this.players.list = list;
    this.players.byId = byId;
    // Re-link armies' player refs in case ids overlap a previous game.
    for (const a of this._armiesById.values()) {
      if (a.player) {
        const next = byId.get(a.player.id);
        a.player = next ?? null;
      }
    }
    this.emit("players:changed", { players: list });
  }

  applySnapshot(snapshot) {
    this.tick = snapshot.tick;
    this.elapsed = snapshot.elapsed;
    this.moveFadeTicks = snapshot.moveFadeTicks;

    // Reuse map if dims unchanged. The init flow calls applyMap
    // explicitly; here we only catch a config mismatch defensively.
    if (
      this.map.width !== snapshot.mapWidth ||
      this.map.height !== snapshot.mapHeight ||
      this.map.wrap !== snapshot.mapWrap
    ) {
      this.applyMap(snapshot.mapWidth, snapshot.mapHeight, snapshot.mapWrap);
    }

    // Clear tile.armies and totals.territory will come from playerTotals.
    for (const t of this.map.tiles) t.armies.length = 0;

    // Update player totals in place (player views persist).
    if (snapshot.playerTotals) {
      for (const pt of snapshot.playerTotals) {
        const p = this.players.byId.get(pt.id);
        if (!p) continue;
        p.totals.strength = pt.strength;
        p.totals.territory = pt.territory;
        p.totals.armies = pt.armies;
      }
    }

    // Reconcile armies. Existing ArmyViews are reused so renderer-only
    // state (bornAt) survives; armies absent from the snapshot are
    // marked dead and dropped.
    const seen = new Set();
    const liveArmies = [];
    for (const a of snapshot.armies) {
      let view = this._armiesById.get(a.id);
      if (!view) {
        view = new ArmyView(a.id);
        this._armiesById.set(a.id, view);
      }
      view.alive = true;
      view.pos.x = a.x;
      view.pos.y = a.y;
      view.strength = a.strength;
      view.maxStrength = a.maxStrength;
      view.player = this.players.byId.get(a.playerId) ?? null;
      const tile = this.map.tiles[a.y * this.map.width + a.x];
      view.tile = tile;
      if (tile) tile.armies.push(view);
      liveArmies.push(view);
      seen.add(a.id);
    }
    // Tombstone armies that fell out of the snapshot.
    for (const [id, view] of this._armiesById) {
      if (seen.has(id)) continue;
      view.alive = false;
      view.tile = null;
      this._armiesById.delete(id);
    }
    this.armies = liveArmies;

    // Recent moves: plain copies, no shared refs.
    this.recentMoves = snapshot.recentMoves || [];

    // History: replace wholesale - bounded by maxHistory in the engine.
    this.history = snapshot.history || [];

    this._applyPlans(snapshot.plans);
  }

  _applyPlans(plans) {
    // Drop any keys we set last snapshot - prevents a stale plan from
    // lingering when overlay flips off, a player no longer has one, or
    // a strategy stops painting.
    if (this._planKeys.size > 0) {
      for (const key of this._planKeys) delete this[key];
      this._planKeys.clear();
    }
    if (!plans) return;
    for (const p of plans) {
      const key = `${p.prefix}${p.playerId}`;
      this[key] = {
        tick: p.tick,
        plan: { roles: p.roles, depth: p.depth, friendly: p.friendly },
      };
      this._planKeys.add(key);
    }
  }
}
