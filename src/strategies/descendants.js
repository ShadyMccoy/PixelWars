// Auto-managed registry of descendant bots produced by the genetic-spawn
// system. Each descendant lives in its own file under src/strategies/,
// named like `<Family>_g<N>_<shortid>.js`. This file is rewritten by
// `tournament/run.js --register-descendant` — hand edits will be
// overwritten the next time a descendant is registered.

import Crusader_g1_5ae640 from "./Crusader_g1_5ae640.js";
import Spearhead_g1_3f955f from "./Spearhead_g1_3f955f.js";
import Spearhead_g1_859468 from "./Spearhead_g1_859468.js";
import Trinity_g1_3786cc from "./Trinity_g1_3786cc.js";

export const DESCENDANTS = [
  Crusader_g1_5ae640,
  Spearhead_g1_3f955f,
  Spearhead_g1_859468,
  Trinity_g1_3786cc,
];
