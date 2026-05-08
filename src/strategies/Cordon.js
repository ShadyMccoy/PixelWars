import Parent from "./Conqueror_g13_b41df9.js";

const BONUS = 1.4;
const MARGIN = 0.45;
// Below this attackPower, even a successful empty-tile capture
// lands with so little strength behind it that it's trivially
// retaken — and the +1 move overhead is paid in full regardless.
// 1.8 keeps Pass 1 kills (which gate on enemy/BONUS+MARGIN <= sLimit
// anyway) intact, but skips the inefficient "spend 1.5 to take an
// empty tile that lands with 0.5 strength" branch.
const WEAK_LIMIT = 1.8;

function hasBeatableAdjacentEnemy(tile, pid, sLimit) {
  const n = tile.neighbors;
  for (let i = 0; i < 4; i++) {
    const t = n[i];
    if (!t) continue;
    const armies = t.armies;
    if (armies.length === 0) continue;
    let friendly = false;
    let enemy = 0;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) { friendly = true; break; }
      enemy += a.strength;
    }
    if (friendly) continue;
    if (enemy > 0 && enemy / BONUS + MARGIN <= sLimit) return true;
  }
  return false;
}

export default {
  name: "Cordon",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13 chassis with one strict-upgrade gate: when the army's attackPower is below a weak-action threshold and no adjacent enemy is beatable, idle. Saves the +1 move overhead on ticks where the chassis would otherwise spend it on a near-zero-yield expansion.",
  summary: `Cost formula on this ruleset is power*distance + 1. A move
of 1.5 strength to an empty adjacent tile costs 2.5 work and lands
with 0.5 strength on the captured tile (the rest is overhead). The
capture is real but the resulting tile is below the retake threshold
of any adjacent enemy with > 0.5 strength — the +1 overhead bought
nothing durable.

Reservoir already idles on the specific case where every neighbor
is a maxed friendly. Cordon addresses the complementary case: the
army itself is too weak to do anything efficient, regardless of
what's adjacent. Concretely:

  1. If sLimit (army.attackPower) >= WEAK_LIMIT (1.8), defer to
     chassis verbatim. The chassis is well-tuned for normal-strength
     actions and we don't want to second-guess it.
  2. If sLimit < 1.8 AND any adjacent enemy is beatable per the
     chassis's own gate (enemy/1.4 + 0.45 <= sLimit), defer — the
     kill is real and worth the move overhead even at low strength.
  3. Otherwise (weak source, no winnable adjacent kill), idle.
     Whatever Conqueror.act would have done — capture an empty,
     reinforce a friendly with a tiny topup — the +1 overhead
     is dominant and the result is fragile. Holding lets the tile
     accumulate one more tick of growth, so by next tick we
     either clear WEAK_LIMIT (back to chassis) or remain idle for
     another tick at zero cost. Either is dominated by paying the
     overhead now.

Why this is a strict upgrade rather than a different bot:
  - Pass 1 kills (the chassis's main value driver) are unaffected
    because we explicitly defer when one is available, and the
    sLimit > 0.5 chassis early-return still holds.
  - Pass 2 / Pass 3 stencil walks are unaffected when sLimit is
    healthy. They only get skipped when sLimit is weak, and at
    weak strength their +1 overhead exceeds the delivered value.
  - The threshold WEAK_LIMIT = 1.8 is conservative: enemy/1.4 +
    0.45 <= 1.8 already requires enemy < 1.89, so the only kills
    we'd skip at the boundary are tiny-enemy captures that the
    chassis itself would rate low. We don't lose meaningful kills.

Tech mirrors g14_8d5369's validated chassis loadout {move:76,
stack:0, prod:16, atk:5, def:3}. Idle behavior is pure addition.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Parent.act(army, game);
      return;
    }
    if (sLimit < WEAK_LIMIT) {
      const pid = army.player.id;
      if (!hasBeatableAdjacentEnemy(tile, pid, sLimit)) return;
    }
    Parent.act(army, game);
  },
};
