// Archived bots — excluded from new tournaments and the HUD strategy
// dropdown, but still loadable by name for replays and league watching.
//
// This file is auto-managed by:
//   node tournament/run.js --archive-bottom N      # archive bottom N tiers
//   node tournament/run.js --archive-clear         # remove all
//   node tournament/run.js --archive-add A,B,C
//   node tournament/run.js --archive-remove A,B,C
//   node tournament/run.js --register-descendant   # auto-archives the
//                                                  # globally weakest bot
//
// You can also hand-edit it.
export const ARCHIVED = [
  "Opportunist",
];
