import Spearhead from "./Spearhead.js";

// Spearhead with extreme MOVE tech (90/0/2/4/4 instead of the
// character-default 50/50 atk/move). The GA discovered that
// dumping ~90% of tech points into MOVE - which lowers the
// per-attack garrison floor from 1.0 toward 0.10 - turns a 30%
// win-rate Spearhead into a 94.5% win-rate Spearhead against the
// elite top-10 pool. The win comes from the tech axis, not from
// new act() logic, so this descendant rebrands Spearhead with
// the discovered tech.
export default {
  ...Spearhead,
  name: "Spearhead_g1_7089d3",
  description: "Spearhead with extreme move tech (90/0/2/4/4) - GA-discovered.",
  summary: `Identical Spearhead behavior; the only change is that
default character tech is overridden to {move:90, stack:0, prod:2,
atk:4, def:4}. Tech alone explained a ~64-pp win-rate jump against
the elite pool with neutral-tech opponents. Move tech reduces the
garrison floor on every attack, throwing more strength into combat
each tick. Other strategies see similar gains - this isn't
Spearhead-specific optimization, it's an underexploited engine
knob that the GA was the first to actually crank.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
};
