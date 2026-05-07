// Bump when a rule change invalidates historical match results — combat
// math, tech slopes, growth/maxArmy defaults, anything that would make
// past finishing-orders misleading as a measure of current bot skill.
//
// Bot logic changes (a strategy bug fix, a new bot) do NOT need a bump:
// PL absorbs that as the bot's skill drifting. Bump only for engine /
// balance changes that affect everyone's outcomes.
//
// `tournament/rank.js` ignores matches whose rulesVersion ≠ this string,
// so old entries stay on disk but stop influencing rankings until
// they're regenerated.
export const RULES_VERSION = "v7";
