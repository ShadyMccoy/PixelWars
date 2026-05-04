// Heuristic detectors for "interesting" match results. Pure functions over
// the result shape returned by runMatch — same module loads in Node and the
// browser.
//
// Each detector returns either null or { tag, note } where `tag` is a short
// machine-readable label and `note` is a human-readable string with the
// numbers spliced in.

function closeFinish(result) {
  const survivors = result.ranking.filter((r) => r.survived);
  if (survivors.length < 2) return null;
  const [a, b] = survivors;
  if (a.territory < 4 || b.territory < 4) return null;
  const ratio = a.territory / Math.max(b.territory, 1);
  if (ratio > 1.3) return null;
  return {
    tag: "close-finish",
    note: `top two finished within ${(ratio * 100 - 100).toFixed(0)}% (${a.territory} vs ${b.territory})`,
  };
}

// Plain stalemates (max-ticks with no winner) are too common to be
// interesting on their own — they fire on most random K-of-N matchups in
// small maps. close-finish catches the subset where the survivors ended
// near each other in territory, which is the tense version.

function mutualDestruction(result) {
  if (result.endReason !== "mutual-destruction") return null;
  return { tag: "mutual-destruction", note: `nobody survived; ended at tick ${result.ticks}` };
}

// crowded-finish was here, but it gave a misleading signal — by the time
// the saved match is opened in the viewer the cascade has already wrapped
// up, so the visible state is one survivor regardless of how crowded it
// was at the 75% mark. close-finish handles the genuinely-tense subset
// (top two both alive at the end with similar territory).

function runaway(result) {
  // Winner crushed the field — survived with >= 5x the territory of #2 and
  // half the field eliminated by the 25% mark.
  const survivors = result.ranking.filter((r) => r.survived);
  if (survivors.length !== 1) return null;
  const winner = survivors[0];
  const second = result.ranking[1];
  if (!second) return null;
  if (winner.territory < (second.territory || 1) * 5) return null;
  const earlyDeaths = result.ranking.filter(
    (r) => r.eliminatedAt != null && r.eliminatedAt < result.ticks * 0.25,
  ).length;
  if (earlyDeaths < Math.ceil((result.ranking.length - 1) / 2)) return null;
  return {
    tag: "runaway",
    note: `${winner.strategy} crushed the field (${earlyDeaths} eliminated by tick ${Math.floor(result.ticks * 0.25)})`,
  };
}

const DETECTORS = [closeFinish, mutualDestruction, runaway];

export function detectFlags(result, { maxTicks = 4000 } = {}) {
  const out = [];
  for (const fn of DETECTORS) {
    const f = fn(result, maxTicks);
    if (f) out.push(f);
  }
  return out;
}

export const FLAG_TAGS = ["close-finish", "mutual-destruction", "runaway"];
