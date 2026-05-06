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
// the initial 0.010 guesses; def was strictly dominated. These values
// were tuned to bring per-point winrate coefficients close to zero
// across Berserker, Turtle, Hunter, SlowAndSteady, and Swarm.
export const SLOPES = Object.freeze({
  move:  0.0030,  // tech 0 -> 0.94x, tech 100 -> 1.24x
  stack: 0.0008,  // tech 0 -> 0.984x, tech 100 -> 1.064x
  prod:  0.0008,  // tech 0 -> 0.984x, tech 100 -> 1.064x
  atk:   0.0030,  // tech 0 -> 0.94x, tech 100 -> 1.24x
  def:   0.0050,  // tech 0 -> 0.90x, tech 100 -> 1.40x
});

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
    mults[k] = 1.0 + (t[k] - BASELINE) * SLOPES[k];
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
