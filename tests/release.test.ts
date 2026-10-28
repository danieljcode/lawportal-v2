// Release process (LP-74): the version shown in the app, What's new versions,
// and the GitHub Release notes built from them; release-please's Jira links (LP-116).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { APP_VERSION } from "@/lib/version";
import { buildNotes, issueKeys, JIRA_BROWSE } from "../scripts/release-notes.mjs";
import { dropRepeats, linkJiraKeys } from "../scripts/tidy-changelog.mjs";

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

describe("tidying release-please's changelog (LP-116)", () => {
  it("link every [LP-n], and leave a linked one alone", () => {
    const md = "* **e2e:** screenshot tests [LP-117] ([8f9c76a](https://github.com/x))\n* [LP-118] and [LP-7]";
    const linked = linkJiraKeys(md);
    expect(linked).toBe(
      `* **e2e:** screenshot tests [LP-117](${JIRA_BROWSE}LP-117) ([8f9c76a](https://github.com/x))\n` +
        `* [LP-118](${JIRA_BROWSE}LP-118) and [LP-7](${JIRA_BROWSE}LP-7)`,
    );
    expect(linkJiraKeys(linked)).toBe(linked);
  });

  it("drop an entry repeated in the same version (a merge commit holds its PR's title)", () => {
    const md = [
      "## [0.3.0](https://github.com/x) (2026-10-28)",
      "### Features",
      "* **cases:** add the Case File program [LP-101] ([9e6bcb4](https://github.com/x/9e6bcb4))",
      "* **cases:** add the Case File program [LP-101] ([3d2eb70](https://github.com/x/3d2eb70))",
      "* **forms:** mark the required fields [LP-87] ([1a8b742](https://github.com/x/1a8b742))",
      "## [0.2.1](https://github.com/x) (2026-10-20)",
      "* **cases:** add the Case File program [LP-101] ([0000000](https://github.com/x/0000000))",
    ].join("\n");
    const lines = dropRepeats(md).split("\n");
    expect(lines).toHaveLength(6);
    expect(lines.filter((l: string) => l.includes("Case File program"))).toEqual([md.split("\n")[2], md.split("\n")[6]]);
    expect(dropRepeats(dropRepeats(md))).toBe(dropRepeats(md));
  });
});
