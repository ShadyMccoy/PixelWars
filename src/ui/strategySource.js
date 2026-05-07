// Resolves the source code for a strategy by name.
//
// Most bots live in their own file under `src/strategies/` (filename
// matches `strategy.name`), so we just fetch that. A handful are
// declared inline (factory output in `generated.js`, parametric
// variants under `src/strategies/parametric/`) — for those we fall
// back to `String(strategy.act)`, which is honest about what's
// actually being run even if it loses helper imports.

const FETCH_BASES = ["src/strategies/", "src/strategies/parametric/"];
const fetchCache = new Map();

async function tryFetch(path) {
  if (fetchCache.has(path)) return fetchCache.get(path);
  const promise = fetch(path, { cache: "no-cache" })
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null);
  fetchCache.set(path, promise);
  return promise;
}

export async function getStrategySource(strategy, { customBots } = {}) {
  if (!strategy) return { source: "", origin: "missing" };

  if (customBots) {
    const custom = customBots.getCode(strategy.name);
    if (custom != null) return { source: custom, origin: "custom" };
  }

  for (const base of FETCH_BASES) {
    const path = `${base}${strategy.name}.js`;
    const text = await tryFetch(path);
    if (text != null) return { source: text, origin: path };
  }

  if (typeof strategy.act === "function") {
    const body = strategy.act.toString();
    const meta = `// ${strategy.name}\n// (factory-built; showing act() body — closure-bound helpers omitted)\n\n`;
    return { source: meta + body, origin: "act-toString" };
  }

  return { source: "// (no source available)", origin: "missing" };
}
