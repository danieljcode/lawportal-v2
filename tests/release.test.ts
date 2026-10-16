// Release process (LP-74): the version shown in the app, What's new versions,
// and the GitHub Release notes built from them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { APP_VERSION } from "@/lib/version";
import { buildNotes, issueKeys, JIRA_BROWSE } from "../scripts/release-notes.mjs";

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as { version: string };
const SEMVER = /^\d+\.\d+\.\d+$/;

function compare(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

describe("app version", () => {
  it("is package.json's version", () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(SEMVER);
  });

  it("What's new versions are x.y.z, newest first, and none is ahead of package.json", () => {
    const versions = CHANGELOG.map((e) => e.version).filter((v): v is string => !!v);
    for (const v of versions) expect(v).toMatch(SEMVER);
    expect([...versions].sort((a, b) => compare(b, a))).toEqual(versions);
    expect(new Set(versions).size).toBe(versions.length);
    if (versions.length) expect(compare(versions[0], pkg.version)).toBeLessThanOrEqual(0);
  });
});

describe("release notes", () => {
  const log: ChangelogEntry[] = [
    {
      date: "2026-11-01",
      title: "Stable and FreestyleRP",
      version: "0.2.0",
      items: [
        { type: "fix", text: "A fix." },
        { type: "new", text: "A new thing." },
        { type: "update", text: "A change." },
      ],
    },
    { date: "2026-10-01", items: [{ type: "new", text: "Older." }] },
  ];

  it("collects unique Jira keys from commit subjects and branch names, in number order", () => {
    expect(
      issueKeys([
        "fix(sync): merge conflicts per character [LP-64]",
        "Merge pull request #3 from danieljcode/LP-65-keep-corrupt-data",
        "docs(docs): add licence [LP-73]",
        "ci(forms): fetch reference data [LP-66] and LP-64 again",
        "chore: no key",
      ]),
    ).toEqual(["LP-64", "LP-65", "LP-66", "LP-73"]);
  });

  it("are the version's What's new entry, grouped like the dialog, then its Jira issues", () => {
    expect(buildNotes("0.2.0", log, ["LP-63", "LP-64"])).toBe(
      [
        "## v0.2.0: Stable and FreestyleRP (2026-11-01)",
        "",
        "### New",
        "",
        "- A new thing.",
        "",
        "### Updated",
        "",
        "- A change.",
        "",
        "### Fixed",
        "",
        "- A fix.",
        "",
        "### Jira issues",
        "",
        `- [LP-63](${JIRA_BROWSE}LP-63)`,
        `- [LP-64](${JIRA_BROWSE}LP-64)`,
        "",
      ].join("\n"),
    );
  });

  it("refuse a version with no What's new entry", () => {
    expect(() => buildNotes("0.3.0", log, [])).toThrow(/no What's new entry has version: "0.3.0"/);
  });
});
