// Links every "[LP-n]" in a Markdown file to its Jira issue, in place (LP-116). release-please can't:
// its changelog only links GitHub issues. The release workflow runs it on the Release PR's
// CHANGELOG.md and on the published GitHub Release's notes. Running it twice changes nothing.
//
// Usage: node scripts/link-jira.mjs <file>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { JIRA_BROWSE } from "./release-notes.mjs";

/** `[LP-64]` → `[LP-64](…/browse/LP-64)`; a key that's already a link is left alone. */
export function linkJiraKeys(markdown) {
  return markdown.replace(/\[(LP-\d+)\](?!\()/g, (_, key) => `[${key}](${JIRA_BROWSE}${key})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/link-jira.mjs <file>");
    process.exitCode = 2;
  } else writeFileSync(file, linkJiraKeys(readFileSync(file, "utf8")));
}
