// Auto-managed registry of descendant bots produced by the genetic-spawn
// system. Each descendant lives in its own file under src/strategies/,
// named like `<Family>_g<N>_<shortid>.js`. This file is rewritten by
// `tournament/run.js --register-descendant` — hand edits will be
// overwritten the next time a descendant is registered.

import Spearhead_g1_859468 from "./Spearhead_g1_859468.js";
import Trinity_g1_3786cc from "./Trinity_g1_3786cc.js";

export const DESCENDANTS = [
  Spearhead_g1_859468,
  Trinity_g1_3786cc,
];
