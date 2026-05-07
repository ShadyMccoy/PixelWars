#!/usr/bin/env node
// Compute global Plackett-Luce ratings from tournament/matches.jsonl and
// write them to tournament/rankings.json.
//
// Ratings are scaled to look like Elo: rating = 1000 + 400 * log10(skill),
// with PL skills normalized so the geometric mean is 1. So the median bot
// sits near 1000; ratings above/below reflect odds of out-finishing the
// median in head-to-head terms.

import { loadMatches } from "./matchLog.js";
import { fitPlackettLuce } from "./plackettLuce.js";
import { saveRankings, getRankingsPath } from "./rankingsStore.js";
import { RULES_VERSION } from "../src/core/version.js";
import { expandManyToOrderings, isStalemate } from "./stalemateExpand.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RATING_BASE = 1000;
const RATING_SCALE = 400;

export function skillToRating(skill) {
  return Math.round(RATING_BASE + RATING_SCALE * Math.log10(skill));
}

export function filterCurrentVersion(matches) {
  return matches.filter((m) => m.rulesVersion === RULES_VERSION);
}

export function buildRankings(matches) {
  // Stalemates contribute N synthetic orderings drawn from each survivor's
  // strength+territory share, each weighted 1/N so total evidence equals
  // one decisive match. Decisive matches contribute one ordering, weight 1.
  const { orderings, weights } = expandManyToOrderings(matches);
  const { skill, iterations, converged } = fitPlackettLuce(orderings, { weights });

  const stats = new Map();
  for (const name of Object.keys(skill)) {
    stats.set(name, { matches: 0, wins: 0, sumPlace: 0, sumOf: 0 });
  }
  for (const m of matches) {
    const K = m.ranking.length;
    if (K < 2) continue;
    const stale = isStalemate(m);
    for (const r of m.ranking) {
      const s = stats.get(r.name);
      if (!s) continue;
      s.matches++;
      s.sumPlace += r.place;
      s.sumOf += K - 1;
      // Don't credit a "win" for placing 1st via the territory-tiebreak
      // at stalemate; that's the whole point of the partial-credit fix.
      if (r.place === 0 && !stale) s.wins++;
    }
  }

  const players = Object.entries(skill).map(([name, sk]) => {
    const st = stats.get(name);
    return {
      name,
      rating: skillToRating(sk),
      skill: +sk.toFixed(6),
      matches: st.matches,
      wins: st.wins,
      avgFinish: st.sumOf > 0 ? +(st.sumPlace / st.sumOf).toFixed(3) : null,
    };
  });
  players.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    matchCount: matches.length,
    iterations,
    converged,
    players,
  };
}

async function main() {
  const allMatches = await loadMatches();
  if (!allMatches.length) {
    console.error("No matches in matches.jsonl. Run a tournament first.");
    process.exit(1);
  }
  const matches = allMatches.filter((m) => m.rulesVersion === RULES_VERSION);
  const skipped = allMatches.length - matches.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} matches from previous rule versions (current: ${RULES_VERSION}).`);
  }
  if (!matches.length) {
    console.error(`No matches at rules version ${RULES_VERSION}. Run a tournament to generate fresh data.`);
    process.exit(1);
  }

  console.log(`Fitting Plackett-Luce on ${matches.length} matches...`);
  const t0 = Date.now();
  const rankings = buildRankings(matches);
  const dt = Date.now() - t0;
  console.log(`  ${rankings.iterations} iterations in ${dt}ms (converged=${rankings.converged})`);

  await saveRankings(rankings);
  console.log(`Wrote ${getRankingsPath()}: ${rankings.players.length} players`);
  console.log(`\nTop 15:`);
  for (const p of rankings.players.slice(0, 15)) {
    console.log(`  ${String(p.rating).padStart(5)}  ${p.name.padEnd(20)} (${p.matches}m, ${p.wins}w, avgFin=${p.avgFinish ?? "-"})`);
  }
  if (rankings.players.length > 15) {
    console.log(`  ...`);
    const bottom = rankings.players.slice(-3);
    for (const p of bottom) {
      console.log(`  ${String(p.rating).padStart(5)}  ${p.name.padEnd(20)} (${p.matches}m, ${p.wins}w, avgFin=${p.avgFinish ?? "-"})`);
    }
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
