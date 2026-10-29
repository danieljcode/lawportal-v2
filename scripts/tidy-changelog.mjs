// Tidies release-please's Markdown in place (LP-116): the Release PR's CHANGELOG.md and the published
// GitHub Release's notes. Running it twice changes nothing.
//
// - Drops repeated entries. A merge commit's message holds its PR's title, which release-please reads
//   as one more commit, so a PR's title shows up next to the same commit from its branch.
//
// Usage: node scripts/tidy-changelog.mjs <file>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Within each version ("## …"), keep the first of entries that differ only in their commit link. */
export function dropRepeats(markdown) {
  let seen = new Set();
  return markdown
    .split("\n")
    .filter((line) => {
      if (line.startsWith("## ")) seen = new Set();
      if (!line.startsWith("* ")) return true;
      const entry = line.replace(/ \(\[[0-9a-f]{7,40}\]\([^)]*\)\)$/, "");
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    })
    .join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/tidy-changelog.mjs <file>");
    process.exitCode = 2;
  } else writeFileSync(file, dropRepeats(readFileSync(file, "utf8")));
}
