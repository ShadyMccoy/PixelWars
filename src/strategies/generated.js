// 100 parameterized bots, built from src/strategies/factory.js. Grouped into
// ten thematic families of ten:
//
//   Hunter_*      target weakest WINNABLE enemy; vary commitment fraction
//   Probe_*       send a small fractional force toward the weakest neighbor
//   Patient_*     wait until a strength threshold, then attack
//   Drift_*       bias movement in a specific compass direction
//   Pacifist_*    only attack empty tiles; vary expansion appetite
//   Bully_*       target the STRONGEST enemy (whether winnable or not)
//   Cluster_*     prefer attacking tiles already held by friendlies
//   Scatter_*     refuse to land on friendly tiles; vary target preference
//   Pulse_*       only act on a tick cadence (period & phase)
//   Stencil_*     pick direction by convolving 5x5 kernels (Trinity-style)
//
// Each bot carries a `summary` describing its family's thesis with the
// specific bot's parameters spliced in. See docs/strategies.md for the
// distinction between `description` (HUD one-liner) and `summary`.

import { makeBot, makeStencilBot } from "./factory.js";

const pad2 = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- Hunters
const HUNTERS = [];
for (let i = 1; i <= 10; i++) {
  const frac = i / 10;
  const pct = Math.round(frac * 100);
  HUNTERS.push(makeBot({
    name: `Hunter_${pad2(i)}`,
    description: `Targets weakest beatable enemy; commits ${pct}% of force.`,
    requireEnemy: true,
    requireWinnable: true,
    forceFrac: frac,
    fallbackName: "slow",
    summary: `Hunter family. Greedy on contact: only considers neighbors that
contain enemies AND that we can beat with margin (their total < our
strength - 1). Among those, picks the WEAKEST so we are guaranteed a clean
take. Commitment fraction here is ${pct}% of (strength - 1); low fractions
let us keep biting smaller stacks tick after tick, while higher fractions
front-load the win and leave less behind. With no winnable enemy adjacent,
we fall back to SlowAndSteady so we never sit idle. Expected to do well
against bots that bunch up and badly against Pacifists who never present
an attackable target.`,
  }));
}

// ----------------------------------------------------------------- Probes
const PROBES = [];
for (let i = 1; i <= 10; i++) {
  const frac = i / 20; // 5% .. 50%
  const pct = Math.round(frac * 100);
  PROBES.push(makeBot({
    name: `Probe_${pad2(i)}`,
    description: `Sends ${pct}% of force toward the weakest neighbor.`,
    forceFrac: frac,
    forceMinPower: 1.0,
    minStrengthAbs: 2.0,
    summary: `Probe family. Tiny commitments (${pct}% of strength - 1, floored at
1.0) toward whichever neighbor scores lowest on enemy strength. The thesis
is Swarm-like: spread thin, retain the home stack, and let the regrowth
clock do the work. Probes are hard to kill because they always leave most
of their strength behind, but they are also slow to take a heavy enemy
tile — so they tend to win on map control rather than knockouts.`,
  }));
}

// ---------------------------------------------------------------- Patients
const PATIENTS = [];
for (let i = 1; i <= 10; i++) {
  const thresh = 0.1 + i * 0.08; // 18% .. 90%
  const pct = Math.round(thresh * 100);
  PATIENTS.push(makeBot({
    name: `Patient_${pad2(i)}`,
    description: `Holds until ${pct}% strength, then attacks weakest neighbor with balance.`,
    minStrengthFrac: thresh,
    forceMode: "balance",
    summary: `Patient family. Sits idle until strength climbs to ${pct}% of
maxStrength, then plays a balanceAttack on the weakest neighbor. The
higher the threshold, the longer we hoard before moving — the better the
single push, the more time we cede to neighbors who were already
expanding. This bot is essentially Cautious with a tunable threshold; it
trades early board presence for late-game punch.`,
  }));
}

// ---------------------------------------------------------------- Drifters
const DRIFTS_SPEC = [
  ["E",   [-2, 4, 0, 0],   "east"],
  ["W",   [4, -2, 0, 0],   "west"],
  ["N",   [0, 0, 4, -2],   "north"],
  ["S",   [0, 0, -2, 4],   "south"],
  ["NE",  [-2, 3, 3, -2],  "northeast"],
  ["NW",  [3, -2, 3, -2],  "northwest"],
  ["SE",  [-2, 3, -2, 3],  "southeast"],
  ["SW",  [3, -2, -2, 3],  "southwest"],
  ["EvN", [-1, 1, 1, -1],  "east-and-north (mild)"],
  ["WvS", [1, -1, -1, 1],  "west-and-south (mild)"],
];
const DRIFTS = DRIFTS_SPEC.map(([dir, grad, longName]) => makeBot({
  name: `Drift_${dir}`,
  description: `Like SlowAndSteady but biased ${dir}.`,
  gradient: grad,
  forceMode: "balance",
  summary: `Drift family. Generalises Repel: every tick we score the four
neighbors as SlowAndSteady would, then subtract a per-direction bonus
[w,e,n,s] = [${grad.join(", ")}] before picking the lowest. The net effect
is a constant lean toward ${longName}, regardless of where we started or
who is in the way. Useful as a control: pairs of opposing drifts (E vs W,
NE vs SW) test whether the map's geometry favours one direction. On
non-wrapping maps this bot will eventually pin itself against a wall.`,
}));

// --------------------------------------------------------------- Pacifists
const PACIFIST_SPEC = [
  { thresh: 0.0, frac: 0.5 },
  { thresh: 0.0, frac: 1.0 },
  { thresh: 0.2, frac: 0.5 },
  { thresh: 0.2, frac: 1.0 },
  { thresh: 0.4, frac: 0.5 },
  { thresh: 0.4, frac: 1.0 },
  { thresh: 0.6, frac: 0.5 },
  { thresh: 0.6, frac: 1.0 },
  { thresh: 0.8, frac: 0.5 },
  { thresh: 0.8, frac: 1.0 },
];
const PACIFISTS = PACIFIST_SPEC.map(({ thresh, frac }, i) => {
  const tpct = Math.round(thresh * 100);
  const fpct = Math.round(frac * 100);
  return makeBot({
    name: `Pacifist_${pad2(i + 1)}`,
    description: `Expands only into empty tiles (>= ${tpct}% strength, ${fpct}% commitment).`,
    requireEmpty: true,
    minStrengthFrac: thresh,
    forceFrac: frac,
    summary: `Pacifist family. Refuses to attack any tile that is occupied —
only spreads into empty squares. This bot acts only when at >= ${tpct}% of
maxStrength and commits ${fpct}% of (strength - 1) per push. Pacifists
race to enclose territory before the war starts; once enemies surround
them they stop moving entirely and just regrow in place. Strong on open
maps, brittle anywhere they can't outrun the front line. Predictable
weakness: a Bully or Hunter on the border will eat them since they will
never punch back.`,
  });
});

// ---------------------------------------------------------------- Bullies
const BULLIES = [];
for (let i = 1; i <= 10; i++) {
  const frac = i / 10;
  const pct = Math.round(frac * 100);
  const winnable = i % 2 === 0;
  BULLIES.push(makeBot({
    name: `Bully_${pad2(i)}`,
    description: `Charges the STRONGEST adjacent enemy${winnable ? " it can beat" : ""}; ${pct}% commitment.`,
    pickMode: "max",
    requireEnemy: true,
    requireWinnable: winnable,
    forceFrac: frac,
    fallbackName: "slow",
    summary: `Bully family. Inverts Hunter: among neighbors with enemies, picks
the STRONGEST stack${winnable ? " we can still beat with margin" : ", winnable or not"} and commits ${pct}% of
(strength - 1). The thesis is that taking out the biggest threat swings
matchups harder than nibbling away at peripheral stacks. ${winnable
  ? "Half the family enforces winnability; this one does, so the bot will refuse hopeless trades."
  : "This variant ignores winnability — it will charge into trades it loses, on the bet that mutual annihilation hurts the opponent more."} With no enemy
adjacent, falls back to SlowAndSteady.`,
  }));
}

// --------------------------------------------------------------- Clusters
const CLUSTER_SPEC = [
  { wf: 5,   thresh: 0.2 },
  { wf: 5,   thresh: 0.5 },
  { wf: 10,  thresh: 0.2 },
  { wf: 10,  thresh: 0.5 },
  { wf: 20,  thresh: 0.3 },
  { wf: 20,  thresh: 0.7 },
  { wf: 50,  thresh: 0.4 },
  { wf: 50,  thresh: 0.85 },
  { wf: 3,   thresh: 0.0 },
  { wf: 100, thresh: 0.5 },
];
const CLUSTERS = CLUSTER_SPEC.map(({ wf, thresh }, i) => {
  const tpct = Math.round(thresh * 100);
  return makeBot({
    name: `Cluster_${pad2(i + 1)}`,
    description: `Pulls toward tiles with friendly armies (weight ${wf}); waits until ${tpct}% strength.`,
    weightFriendly: wf,
    weightEnemy: 1,
    minStrengthFrac: thresh,
    forceMode: "balance",
    summary: `Cluster family. Each tick, score = enemyStrength - ${wf} *
friendlyCount. Waits to ${tpct}% strength then balanceAttacks the lowest
score. With weight ${wf}, friendly density dominates enemy strength: the
bot will gladly attack into a stronger enemy if doing so reinforces a
neighboring friendly stack. The intended behaviour is Defender-like
column formation — armies pile onto each other and march as a brick.
Overcommits in early game when there are no friendlies adjacent yet, so
the threshold gates the wandering until reinforcements exist.`,
  });
});

// ---------------------------------------------------------------- Scatter
const SCATTER_SPEC = [
  { frac: 0.5, emptyBonus: 0 },
  { frac: 1.0, emptyBonus: 0 },
  { frac: 0.5, emptyBonus: 5 },
  { frac: 1.0, emptyBonus: 5 },
  { frac: 0.5, emptyBonus: 20 },
  { frac: 1.0, emptyBonus: 20 },
  { frac: 0.3, emptyBonus: 10 },
  { frac: 0.7, emptyBonus: 10 },
  { frac: 0.9, emptyBonus: 50 },
  { frac: 0.4, emptyBonus: 0 },
];
const SCATTERS = SCATTER_SPEC.map(({ frac, emptyBonus }, i) => {
  const fpct = Math.round(frac * 100);
  return makeBot({
    name: `Scatter_${pad2(i + 1)}`,
    description: `Avoids friendly tiles${emptyBonus ? ", prefers empty ones" : ""}; ${fpct}% commitment.`,
    avoidFriendly: true,
    weightEmptyBonus: emptyBonus,
    forceFrac: frac,
    summary: `Scatter family. Inverse of Cluster: filters out any neighbor
already held by a friendly, so we never stack. ${emptyBonus
  ? `Empty tiles get a +${emptyBonus} bonus, biasing expansion outward instead of into enemy stacks.`
  : "No empty bonus, so target choice depends purely on enemy strength."} Commits ${fpct}% of (strength - 1) per push. Thesis: spreading guarantees
maximum tile coverage while leaving the home stack intact, but it also
means we are always fighting alone — no reinforcements arrive because we
specifically refuse to send any. Strong against Cluster, weak against
Bully, since concentrated force beats distributed force one-on-one.`,
  });
});

// ----------------------------------------------------------------- Pulses
const PULSE_SPEC = [
  { period: 2,  phase: 0, mode: "all",     desc: "every other tick (even), all-in" },
  { period: 2,  phase: 1, mode: "all",     desc: "every other tick (odd), all-in" },
  { period: 3,  phase: 0, mode: "all",     desc: "every 3rd tick, all-in" },
  { period: 3,  phase: 0, mode: "balance", desc: "every 3rd tick, balanced" },
  { period: 4,  phase: 0, mode: "all",     desc: "every 4th tick, all-in" },
  { period: 4,  phase: 2, mode: "balance", desc: "every 4th tick (offset), balanced" },
  { period: 5,  phase: 0, mode: "all",     desc: "every 5th tick, all-in" },
  { period: 6,  phase: 0, mode: "balance", desc: "every 6th tick, balanced" },
  { period: 8,  phase: 0, mode: "all",     desc: "every 8th tick, all-in" },
  { period: 10, phase: 0, mode: "all",     desc: "every 10th tick, all-in" },
];
const PULSES = PULSE_SPEC.map((s, i) => makeBot({
  name: `Pulse_${pad2(i + 1)}`,
  description: `Acts ${s.desc}; targets weakest neighbor on active ticks.`,
  tickPeriod: s.period,
  tickPhase: s.phase,
  forceMode: s.mode,
  forceFrac: 1.0,
  summary: `Pulse family. Acts only on ticks where (game.tick % ${s.period}) ===
${s.phase}; otherwise sits silent and lets growth top up strength. On
active ticks, ${s.mode === "all" ? "commits all available strength (s - 1)" : "plays balanceAttack against the weakest neighbor"}. The longer the period,
the bigger each pulse but the longer the gap during which an opponent
could swarm us. Out-of-phase Pulses (e.g. _01 vs _02) are useful as
matched-cadence controls: same logic, opposite tick parity.`,
}));

// --------------------------------------------------------------- Stencils
function kernelFromOffsets(offsets) {
  const k = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
  for (const [dr, dc, w] of offsets) k[2 + dr][2 + dc] = w;
  return k;
}

function rotateOffsetsForDir(offsets, dir) {
  // Base offsets are written for direction = East. Rotate for others.
  return offsets.map(([dr, dc, w]) => {
    switch (dir) {
      case 0: return [dr, -dc, w];   // West
      case 1: return [dr, dc, w];    // East
      case 2: return [-dc, dr, w];   // North
      case 3: return [dc, -dr, w];   // South
    }
    return [dr, dc, w];
  });
}

function fourKernels(eastPattern) {
  return [0, 1, 2, 3].map((dir) =>
    kernelFromOffsets(rotateOffsetsForDir(eastPattern, dir))
  );
}

const STENCIL_PATTERNS = [
  { name: "01", desc: "front-line: friendlies one step ahead",
    east: [[0, 1, 1], [0, 2, 1]],
    thesis: "Push toward a friendly stripe directly ahead. Forms columnar advances behind a forward picket of allies." },
  { name: "02", desc: "backstop: friendlies behind, push forward",
    east: [[0, -1, 1], [0, -2, 1]],
    thesis: "Move AWAY from clumps of friendlies, treating them as a backstop. Encourages frontier expansion while keeping backfield dense." },
  { name: "03", desc: "wedge: friendlies on forward diagonals",
    east: [[1, 1, 1], [-1, 1, 1]],
    thesis: "Form a wedge: prefer directions where friendlies are diagonally ahead. Naturally produces V-shaped formations on open ground." },
  { name: "04", desc: "flank-protected: friendlies on perpendicular flanks",
    east: [[1, 0, 1], [-1, 0, 1]],
    thesis: "Move in the direction perpendicular to where our flanks already exist. Encourages line formations rather than columns." },
  { name: "05", desc: "trinity: classic three-in-a-row",
    east: [[-1, 1, 1], [0, 1, 1], [1, 1, 1]],
    thesis: "A direct port of Trinity's kernel-style heuristic: prefer directions where three friendlies form a row ahead. Tested baseline." },
  { name: "06", desc: "long-range: pulls toward friendlies two tiles ahead",
    east: [[0, 2, 2], [-1, 2, 1], [1, 2, 1]],
    thesis: "Look further ahead than Trinity. Larger-radius friendly detection helps merge separate detachments at range." },
  { name: "07", desc: "repel: avoids friendlies ahead, seeks open ground",
    east: [[0, 1, -2], [0, 2, -1]],
    thesis: "Negative weights ahead — actively repelled by friendly density in the chosen direction. Net result is reliable scattering, like Repel without a fixed compass bias." },
  { name: "08", desc: "L-shape: friendly ahead and to one side",
    east: [[0, 1, 1], [1, 1, 1], [1, 0, 1]],
    thesis: "Prefer L-shaped friendly groupings. Tends to round corners and curl around obstacles." },
  { name: "09", desc: "box: friendlies forming a forward ring",
    east: [[1, 1, 1], [-1, 1, 1], [0, 2, 1], [1, 2, 1], [-1, 2, 1]],
    thesis: "Score directions that already have a partial ring of friendlies ahead — pushes us into pockets we mostly already control, building hard borders." },
  { name: "10", desc: "asymmetric: forward bias with rear support",
    east: [[0, 1, 2], [0, 2, 1], [0, -1, 1]],
    thesis: "Front-loaded weights with a small rear-support term. Compromise between Stencil_01 (pure forward) and Stencil_02 (pure backstop)." },
];
const STENCILS = STENCIL_PATTERNS.map((p) => makeStencilBot({
  name: `Stencil_${p.name}`,
  description: `Convolves a 5x5 kernel (${p.desc}) and pushes that way.`,
  kernels: fourKernels(p.east),
  forceMode: "all",
  fallbackName: "slow",
  summary: `Stencil family. Builds four 5x5 kernels (one per cardinal
direction) by writing a single offset pattern aimed east and rotating it
for the other three. Each tick we convolve the kernels against the tile's
stencil5 view of friendly density, pick the direction with the highest
score, and commit (strength - 1).
${p.thesis}
Falls back to SlowAndSteady when no direction is viable.`,
}));

// ------------------------------------------------------------------ All
export const GENERATED = [
  ...HUNTERS,
  ...PROBES,
  ...PATIENTS,
  ...DRIFTS,
  ...PACIFISTS,
  ...BULLIES,
  ...CLUSTERS,
  ...SCATTERS,
  ...PULSES,
  ...STENCILS,
];
