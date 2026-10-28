// Checks commit messages and PR titles against the convention (LP-84,
// docs/contributing.md):
//
//   <type>(<area>): <summary> [LP-<n>]     e.g. fix(sync): merge conflicts per character [LP-64]
//
// Usage:
//   node scripts/commit-format.mjs --file <path>        a commit message file (the commit-msg hook)
//   node scripts/commit-format.mjs --range <base>..<head>  every commit in a range (CI, on PRs)
//   node scripts/commit-format.mjs --title              the PR title in $PR_TITLE (CI)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const TYPES = ["feat", "fix", "refactor", "test", "docs", "ci", "chore", "style", "perf"];
export const MAX_LENGTH = 72;
export const FORMAT = "<type>(<area>): <summary> [LP-<n>]";
export const EXAMPLE = "fix(sync): merge conflicts per character [LP-64]";

/** Messages git or GitHub write themselves, which aren't ours to format. */
const GENERATED = /^(Merge (pull request|branch|remote-tracking branch) |Revert ")/;
/** Dependency updates (Dependabot, LP-85) carry no Jira key and can run long. */
const DEPENDENCIES = /^(chore|ci)\(deps(-dev)?\): \S/;
/** The Release PR release-please keeps open (LP-116, docs/releasing.md). */
const RELEASE = /^chore\(main\): release \d+\.\d+\.\d+$/;

/** What's wrong with a commit header or PR title; empty when it follows the convention. */
export function checkHeader(header) {
  const h = String(header ?? "").replace(/\r?\n[\s\S]*$/, "");
  if (!h.trim()) return ["It's empty."];
  if (GENERATED.test(h) || DEPENDENCIES.test(h) || RELEASE.test(h)) return [];

  const m = /^([A-Za-z]+)(?:\(([^)]*)\))?: (.*)$/.exec(h);
  if (!m) return [`It doesn't start with "<type>(<area>): ", for example "fix(sync): ".`];
  const [, type, area, rest] = m;
  const problems = [];
  const known = TYPES.includes(type);
  if (!known && TYPES.includes(type.toLowerCase()))
    problems.push(`The type "${type}" should be lowercase: "${type.toLowerCase()}".`);
  else if (!known) problems.push(`"${type}" isn't one of the types: ${TYPES.join(", ")}.`);
  const shown = known ? type : TYPES.includes(type.toLowerCase()) ? type.toLowerCase() : "fix";
  if (area === undefined) problems.push(`It has no area in brackets after the type, for example "${shown}(sync):".`);
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(area)) {
    problems.push(`The area "${area}" should be the issue's Jira area label: lowercase, like "sync" or "forms".`);
  }

  const key = /(?:^|\s)\[LP-\d+\]$/.exec(rest);
  const summary = (key ? rest.slice(0, key.index) : rest).trim();
  if (!key) problems.push(`It doesn't end with the Jira key in square brackets, for example " [LP-64]".`);
  if (!summary) problems.push("It has no summary between the colon and the key.");
  else {
    // Acronyms (CI, J.A.P.) may lead; ordinary words start lowercase.
    if (/^[A-Z]/.test(summary) && !/^[A-Z][A-Z.]/.test(summary)) {
      problems.push(
        `The summary starts with a capital letter; use lowercase ("${summary[0].toLowerCase()}${summary.slice(1, 12)}…").`,
      );
    }
    if (/\.$/.test(summary)) problems.push("The summary ends with a full stop; leave it off.");
  }
  if (h.length > MAX_LENGTH)
    problems.push(`It's ${h.length} characters; the limit is ${MAX_LENGTH}, including the key.`);
  return problems;
}

/** A plain explanation for one bad header, with the format and an example. */
export function explain(header, problems, what = "Commit message") {
  return [
    `✖ ${what} doesn't follow the convention:`,
    `    ${header}`,
    ...problems.map((p) => `  - ${p}`),
    "",
    `  Format:  ${FORMAT}`,
    `  Example: ${EXAMPLE}`,
    `  Types:   ${TYPES.join(", ")}`,
    "  See docs/contributing.md.",
  ].join("\n");
}

/** The header of a commit message file: its first line that isn't a git comment. */
export function headerOf(message) {
  return (message.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#")) || "").trimEnd();
}

function main(argv) {
  const [mode, value] = argv;
  const failures = [];
  if (mode === "--file" && value) {
    const header = headerOf(readFileSync(value, "utf8"));
    // fixup!/squash! commits are folded away before they're pushed.
    if (!/^(fixup|squash)! /.test(header)) {
      const problems = checkHeader(header);
      if (problems.length) failures.push(explain(header, problems));
    }
  } else if (mode === "--range" && value) {
    const log = execFileSync("git", ["log", "--no-merges", "--format=%h %s", value], { encoding: "utf8" });
    for (const line of log.split("\n").filter(Boolean)) {
      const [sha, ...words] = line.split(" ");
      const header = words.join(" ");
      const problems = checkHeader(header);
      if (problems.length) failures.push(explain(header, problems, `Commit ${sha}`));
    }
  } else if (mode === "--title") {
    const title = process.env.PR_TITLE ?? "";
    const problems = checkHeader(title);
    if (problems.length) failures.push(explain(title, problems, "The pull request title"));
  } else {
    console.error("Usage: node scripts/commit-format.mjs --file <path> | --range <base>..<head> | --title");
    return 2;
  }
  for (const f of failures) console.error(f + "\n");
  return failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
