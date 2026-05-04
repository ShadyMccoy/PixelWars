// Round-robin / FFA tournament scheduler.
import { runMatch } from "./arena.js";

export function runTournament({
  strategies,
  map,
  rounds = 10,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
}) {
  const N = strategies.length;
  if (N < 2) throw new Error("Need at least 2 strategies");

  const standings = new Map();
  for (const s of strategies) {
    standings.set(s.name, {
      name: s.name,
      author: s.author ?? "",
      played: 0,
      wins: 0,
      survived: 0,
      points: 0,
      totalRank: 0,
      totalTerritory: 0,
      totalEliminationTick: 0,
      eliminationCount: 0,
    });
  }

  const positions = map.positions(N);
  const results = [];

  for (let round = 0; round < rounds; round++) {
    // Rotate strategy -> slot mapping so each strategy visits each starting
    // position across rounds, removing positional bias.
    const offset = round % N;
    const lineup = strategies.map((_, i) => strategies[(i + offset) % N]);
    const seed = baseSeed + round;

    const result = runMatch({
      strategies: lineup,
      mapConfig: map.config,
      startPositions: positions,
      seed,
      maxTicks,
    });

    onMatch?.(round, result, lineup);
    results.push({ round, seed, lineup: lineup.map((s) => s.name), ...result });

    for (let i = 0; i < result.ranking.length; i++) {
      const r = result.ranking[i];
      const s = standings.get(r.strategy);
      s.played++;
      s.totalRank += i + 1;
      s.points += N - 1 - i; // Borda
      s.totalTerritory += r.territory;
      if (r.survived) s.survived++;
      if (i === 0 && r.survived) s.wins++;
      if (r.eliminatedAt != null) {
        s.totalEliminationTick += r.eliminatedAt;
        s.eliminationCount++;
      }
    }
  }

  const sorted = [...standings.values()]
    .map((s) => ({
      ...s,
      avgRank: s.played ? s.totalRank / s.played : 0,
      avgTerritory: s.played ? s.totalTerritory / s.played : 0,
      avgEliminationTick: s.eliminationCount ? s.totalEliminationTick / s.eliminationCount : null,
      winRate: s.played ? s.wins / s.played : 0,
      survivalRate: s.played ? s.survived / s.played : 0,
    }))
    .sort((a, b) => b.points - a.points || a.avgRank - b.avgRank);

  return { standings: sorted, results };
}
