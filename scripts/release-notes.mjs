// GitHub Release notes for the version in package.json (README, How to release).
//
// The notes are that version's What's new entry (src/data/changelog.ts, the
// entry whose `version` matches), so the app and the release always say the
// same thing, followed by the Jira keys of every commit since the previous
// release tag. Prints Markdown to stdout:
//
//   npm run -s release-notes > release-notes.md
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const JIRA_BROWSE = "https://freestylelawportal.atlassian.net/browse/";
const GROUPS = [
  ["new", "New"],
  ["update", "Updated"],
  ["fix", "Fixed"],
];

/** Unique Jira keys (`LP-64`) in commit subjects and branch names, in number order. */
export function issueKeys(lines) {
  const keys = new Set();
  for (const line of lines) for (const m of line.matchAll(/\bLP-(\d+)\b/g)) keys.add(Number(m[1]));
  return [...keys].sort((a, b) => a - b).map((n) => "LP-" + n);
}

/** The release notes as Markdown; throws when the changelog has no entry for `version`. */
export function buildNotes(version, changelog, keys) {
  const entry = changelog.find((e) => e.version === version);
  if (!entry) {
    throw new Error(`no What's new entry has version: "${version}" (add it to src/data/changelog.ts first)`);
  }
  const out = [`## v${version}${entry.title ? ": " + entry.title : ""} (${entry.date})`, ""];
  for (const [type, label] of GROUPS) {
    const items = entry.items.filter((i) => i.type === type);
    if (!items.length) continue;
    out.push(`### ${label}`, "", ...items.map((i) => `- ${i.text}`), "");
  }
  out.push("### Jira issues", "");
  out.push(...(keys.length ? keys.map((k) => `- [${k}](${JIRA_BROWSE}${k})`) : ["- None found in the commits."]), "");
  return out.join("\n");
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** The newest `v*` tag that's an ancestor of HEAD and isn't this release's own tag, or null. */
function previousTag(cwd, tag) {
  const tags = git(["tag", "--list", "v*", "--sort=-v:refname"], cwd).split("\n").filter(Boolean);
  for (const t of tags) {
    if (t === tag) continue;
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", t, "HEAD"], { cwd });
      return t;
    } catch {
      // not in this branch's history
    }
  }
  return null;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const { CHANGELOG } = await import(pathToFileURL(path.join(root, "src", "data", "changelog.ts")).href);
  const prev = previousTag(root, "v" + version);
  const range = prev ? [prev + "..HEAD"] : ["HEAD"];
  const subjects = git(["log", ...range, "--format=%s"], root).split("\n");
  process.stdout.write(buildNotes(version, CHANGELOG, issueKeys(subjects)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("release-notes: " + err.message);
    process.exit(1);
  });
}
