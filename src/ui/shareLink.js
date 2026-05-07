// Sync the URL query string with the active match so links can be
// shared. The same params drive the initial load on page open.
//
// Encoded fields (all optional, but width+height anchor the load):
//   w, h        - map width/height
//   g           - growth
//   m           - maxArmy
//   wrap        - "1" if wrap, omitted otherwise
//   seed        - rng seed
//   bots        - comma-separated lineup names
//   pos         - comma-separated "x.y" pairs for start positions
//
// Decoding tolerates missing/garbage values: only `w` and `h` are
// required to take over from defaults; the rest fall back to sensible
// values handled by loadCustomMap.

export function encodeMatchInfo(info) {
  const params = new URLSearchParams();
  if (!info || !info.mapConfig) return params;
  const c = info.mapConfig;
  params.set("w", String(c.width));
  params.set("h", String(c.height));
  params.set("g", String(c.growth));
  params.set("m", String(c.maxArmy));
  if (c.wrap) params.set("wrap", "1");
  if (info.seed != null) params.set("seed", String(info.seed >>> 0));
  if (Array.isArray(info.lineup) && info.lineup.length > 0) {
    params.set("bots", info.lineup.join(","));
  }
  if (Array.isArray(info.startPositions) && info.startPositions.length > 0) {
    params.set(
      "pos",
      info.startPositions.map(({ x, y }) => `${x}.${y}`).join(","),
    );
  }
  return params;
}

export function decodeMatchInfo(searchParams) {
  const w = parseInt(searchParams.get("w"), 10);
  const h = parseInt(searchParams.get("h"), 10);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  const growthRaw = parseFloat(searchParams.get("g"));
  const maxArmyRaw = parseInt(searchParams.get("m"), 10);
  const wrap = searchParams.get("wrap") === "1";
  const seedRaw = searchParams.get("seed");
  const seed = seedRaw != null && seedRaw !== "" ? Number(seedRaw) >>> 0 : null;
  const botsRaw = searchParams.get("bots");
  const lineup = botsRaw
    ? botsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const posRaw = searchParams.get("pos");
  let startPositions = null;
  if (posRaw) {
    const parsed = posRaw
      .split(",")
      .map((pair) => {
        const [x, y] = pair.split(".").map((n) => parseInt(n, 10));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
      })
      .filter(Boolean);
    if (parsed.length > 0) startPositions = parsed;
  }
  return {
    mapConfig: {
      width: w,
      height: h,
      growth: Number.isFinite(growthRaw) ? growthRaw : 1.8,
      maxArmy: Number.isFinite(maxArmyRaw) ? maxArmyRaw : 6,
      wrap,
    },
    seed,
    lineup,
    startPositions,
  };
}

export function readUrlMatchInfo() {
  if (typeof window === "undefined") return null;
  return decodeMatchInfo(new URLSearchParams(window.location.search));
}

// Replace the current URL's query string with one derived from `info`.
// Uses replaceState so back/forward history doesn't fill up with each
// new seed; the URL is for sharing, not navigation.
export function updateUrl(info) {
  if (typeof window === "undefined") return;
  const params = encodeMatchInfo(info);
  const qs = params.toString();
  const { pathname, hash } = window.location;
  const url = qs ? `${pathname}?${qs}${hash}` : `${pathname}${hash}`;
  window.history.replaceState(null, "", url);
}
