// Tech: per-player loadout that modifies engine behavior.
//
// A Tech is { move, stack, prod, atk, def } — non-negative integers
// summing to exactly 100. Tech 20 in any knob is baseline (multiplier
// 1.0); every multiplier is `1.0 + (tech - 20) * slope`. The slopes are
// placeholders to be tuned by tournament calibration.

export const KNOBS = ["move", "stack", "prod", "atk", "def"];

export const NEUTRAL_TECH = Object.freeze({
  move: 20, stack: 20, prod: 20, atk: 20, def: 20,
});

// Slopes calibrated against multi-strategy mirror-match regression
// (see tournament/calibrate.js). Stack and prod were overpowered at
// the initial 0.010 guesses; def was strictly dominated. The first
// pass tuned them down toward zero per-knob coefficients across
// Berserker, Turtle, Hunter, SlowAndSteady, Swarm. The 2026-05 sweep
// of 50 Conqueror_g4_1f6790 tech variants then showed `move` running
// away with the simplex (pureM at 1268 vs orig 90/0/2/4/4 at 1119),
// so v3 halved move's slope and tripled stack/prod. v3 calibration
// (cross-strategy avg) showed move and atk near zero but stack/prod
// overshooting at +0.7%/+0.6% per point — stack/prod compound across
// ticks while atk fires only on attack, so equal-range slopes aren't
// equal value. v4 cuts stack/prod ~40% (0.0030 → 0.0018) and leaves
// move/atk/def alone.
//
// `move` is special: its multiplier is the *minimum garrison* an
// attacking army must leave behind in strength units. Lower garrison
// means the bot can mobilize more of its strength to the front. So
// the relationship is inverted (high tech -> low garrison floor) and
// the formula is in techToMultipliers below. Baseline = 1.0 matches
// the engine's pre-tech "always leave 1" rule.
export const SLOPES = Object.freeze({
  move:  0.0050,  // tech 0 -> 1.5 garrison, tech 100 -> 1.0 garrison
                  // (linear, no clamp; 1.5x dynamic range, below
                  // atk's 1.32x in attack-strength terms and well
                  // below def's 1.95x)
  stack: 0.0018,  // tech 0 -> 0.964x, tech 100 -> 1.144x
  prod:  0.0018,  // tech 0 -> 0.964x, tech 100 -> 1.144x
  atk:   0.0030,  // tech 0 -> 0.94x, tech 100 -> 1.24x
  def:   0.0080,  // tech 0 -> 0.84x, tech 100 -> 1.64x
});

// Garrison floor at tech=0 in the linear move formula. Other knobs
// pivot around 1.0 at tech=BASELINE; move pivots so its endpoints
// land at 1.5 and 0.5 instead. That puts neutral (tech 20) at 1.3
// garrison - a mild penalty for skipping move investment, similar
// in spirit to def's 0.84 baseline at tech 0.
const MOVE_INTERCEPT = 1.5;

const BASELINE = 20;

export function normalizeTech(tech) {
  // Accept partial / undefined input. Missing keys default to 0; if
  // every key is missing or input is null we use the neutral default.
  if (tech == null) return { ...NEUTRAL_TECH };
  const out = { move: 0, stack: 0, prod: 0, atk: 0, def: 0 };
  let provided = 0;
  for (const k of KNOBS) {
    if (tech[k] !== undefined) {
      out[k] = tech[k];
      provided++;
    }
  }
  if (provided === 0) return { ...NEUTRAL_TECH };
  return out;
}

export function validateTech(tech) {
  const t = normalizeTech(tech);
  for (const k of KNOBS) {
    const v = t[k];
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`Tech.${k} must be a non-negative integer, got ${v}`);
    }
  }
  const sum = KNOBS.reduce((s, k) => s + t[k], 0);
  if (sum !== 100) {
    throw new Error(`Tech must sum to 100, got ${sum} (${JSON.stringify(t)})`);
  }
  return t;
}

export function techToMultipliers(tech) {
  const t = validateTech(tech);
  const mults = {};
  for (const k of KNOBS) {
    if (k === "move") {
      // Move's "multiplier" is the garrison floor; high tech reduces
      // the floor so the bot can throw more strength forward. Linear
      // from MOVE_INTERCEPT (1.5) at tech 0 to MOVE_INTERCEPT - 100 *
      // SLOPES.move (0.5) at tech 100. No clamp - the formula is the
      // contract.
      mults[k] = MOVE_INTERCEPT - t[k] * SLOPES[k];
    } else {
      mults[k] = 1.0 + (t[k] - BASELINE) * SLOPES[k];
    }
  }
  return mults;
}

// Convenience: build a tech vector from a partial spec by taking the
// remaining points and spreading them evenly across unspecified knobs.
// Useful for hand-written archetype loadouts. Throws if the partial
// already exceeds 100.
export function techFromPartial(partial) {
  const out = { move: 0, stack: 0, prod: 0, atk: 0, def: 0 };
  const specified = [];
  for (const k of KNOBS) {
    if (partial[k] !== undefined) {
      out[k] = partial[k];
      specified.push(k);
    }
  }
  let used = KNOBS.reduce((s, k) => s + out[k], 0);
  if (used > 100) throw new Error(`techFromPartial: specified knobs already exceed 100 (${used})`);
  const remaining = 100 - used;
  const fillKnobs = KNOBS.filter((k) => !specified.includes(k));
  if (fillKnobs.length === 0 && remaining !== 0) {
    throw new Error(`techFromPartial: all knobs specified but sum=${used} != 100`);
  }
  if (fillKnobs.length > 0) {
    const base = Math.floor(remaining / fillKnobs.length);
    let leftover = remaining - base * fillKnobs.length;
    for (const k of fillKnobs) {
      out[k] = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
    }
  }
  return validateTech(out);
}
