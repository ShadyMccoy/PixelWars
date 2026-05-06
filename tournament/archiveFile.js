// Shared writer for src/strategies/archive.js — the auto-managed list
// of archived bot names. The browser app and the tournament runner both
// honor this list; updating it removes bots from default tournaments
// and from the HUD strategy dropdown without deleting their source.

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARCHIVE_PATH = resolve(HERE, "..", "src", "strategies", "archive.js");

export async function writeArchive(names) {
  const sorted = [...new Set(names)].sort();
  const body =
`// Archived bots — excluded from new tournaments and the HUD strategy
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
${sorted.map((n) => `  ${JSON.stringify(n)},`).join("\n")}
];
`;
  await writeFile(ARCHIVE_PATH, body, "utf8");
  return sorted;
}
