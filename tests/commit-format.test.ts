// The commit and PR title check (LP-84): <type>(<area>): <summary> [LP-<n>].
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkHeader, EXAMPLE, explain, FORMAT, headerOf, MAX_LENGTH, TYPES } from "../scripts/commit-format.mjs";

const SCRIPT = path.resolve(process.cwd(), "scripts/commit-format.mjs");

describe("checkHeader", () => {
  it("accepts every commit made under the convention", () => {
    // git log can't see history in a shallow CI checkout of a PR, so this list is fixed.
    for (const h of [
      "ci(devops): run tests and build on every push [LP-63]",
      "fix(sync): merge conflicts per character [LP-64]",
      "fix(data): set aside unreadable saved data [LP-65]",
      "ci(forms): fetch reference data for parity tests [LP-66]",
      "feat(forms): build case numbers from one FreestyleRP courthouse [LP-68]",
      "refactor(core): remove the server profiles and toggle [LP-70]",
      "docs(docs): add developer documentation in docs/ [LP-83]",
      EXAMPLE,
    ]) {
      expect(checkHeader(h), h).toEqual([]);
    }
  });

  it("accepts the messages git and GitHub write themselves, and dependency updates", () => {
    for (const h of [
      "Merge pull request #13 from danieljcode/LP-83-developer-docs",
      "Merge branch 'main' into LP-84-commit-checks",
      'Revert "fix(sync): merge conflicts per character [LP-64]"',
      "chore(deps): bump next from 15.5.27 to 15.5.30",
      "chore(deps-dev): bump the dev-dependencies group across 1 directory with 4 updates",
      "ci(deps): bump actions/checkout from 4 to 5",
    ]) {
      expect(checkHeader(h), h).toEqual([]);
    }
  });

  it("accepts the titles Dependabot makes with .github/dependabot.yml (LP-85)", () => {
    const config = readFileSync(path.resolve(process.cwd(), ".github/dependabot.yml"), "utf8");
    // npm: prefix chore with the scope; Actions: prefix ci with the scope.
    expect(config).toMatch(/package-ecosystem: npm[\s\S]*?prefix: chore[\s\S]*?prefix-development: chore[\s\S]*?include: scope/);
    expect(config).toMatch(/package-ecosystem: github-actions[\s\S]*?prefix: ci[\s\S]*?include: scope/);
    for (const h of [
      "chore(deps): bump the npm-minor-and-patch group with 3 updates",
      "chore(deps): bump next from 15.5.27 to 16.4.2",
      "chore(deps-dev): bump vitest from 5.0.3 to 6.0.0",
      "ci(deps): bump the github-actions group with 2 updates",
      "ci(deps): bump actions/checkout from 4 to 5",
    ]) {
      expect(checkHeader(h), h).toEqual([]);
    }
  });

  it("only looks at the first line", () => {
    expect(checkHeader(EXAMPLE + "\n\nBody text that is long enough to go well past seventy-two characters.")).toEqual([]);
  });

  it("explains each kind of mistake", () => {
    expect(checkHeader("")).toEqual(["It's empty."]);
    expect(checkHeader("Added the sync merge")).toEqual([
      'It doesn\'t start with "<type>(<area>): ", for example "fix(sync): ".',
    ]);
    expect(checkHeader("bugfix(sync): merge conflicts [LP-64]")).toEqual([
      `"bugfix" isn't one of the types: ${TYPES.join(", ")}.`,
    ]);
    expect(checkHeader("fix: merge conflicts [LP-64]")).toEqual([
      'It has no area in brackets after the type, for example "fix(sync):".',
    ]);
    expect(checkHeader("fix(Sync Stuff): merge conflicts [LP-64]")).toEqual([
      'The area "Sync Stuff" should be the issue\'s Jira area label: lowercase, like "sync" or "forms".',
    ]);
    expect(checkHeader("fix(sync): merge conflicts")).toEqual([
      'It doesn\'t end with the Jira key in square brackets, for example " [LP-64]".',
    ]);
    expect(checkHeader("fix(sync): merge conflicts (LP-64)")[0]).toMatch(/doesn't end with the Jira key/);
    expect(checkHeader("fix(sync): [LP-64]")).toEqual(["It has no summary between the colon and the key."]);
    expect(checkHeader("fix(sync): Merge conflicts [LP-64]")[0]).toMatch(/starts with a capital letter/);
    expect(checkHeader("fix(sync): merge conflicts. [LP-64]")).toEqual(["The summary ends with a full stop; leave it off."]);
  });

  it("allows an acronym to lead the summary", () => {
    expect(checkHeader("fix(forms): J.A.P. examples use the SC format [LP-72]")).toEqual([]);
    expect(checkHeader("ci(devops): CI runs the parity tests [LP-66]")).toEqual([]);
  });

  it(`limits the whole line to ${MAX_LENGTH} characters, key included`, () => {
    const at = "fix(sync): " + "a".repeat(MAX_LENGTH - "fix(sync):  [LP-64]".length) + " [LP-64]";
    expect(at).toHaveLength(MAX_LENGTH);
    expect(checkHeader(at)).toEqual([]);
    const over = at.replace(" [LP-64]", "b [LP-64]");
    expect(checkHeader(over)).toEqual([`It's ${MAX_LENGTH + 1} characters; the limit is ${MAX_LENGTH}, including the key.`]);
  });

  it("reports every problem at once", () => {
    expect(checkHeader("Fix: Merged things.")).toEqual([
      'The type "Fix" should be lowercase: "fix".',
      'It has no area in brackets after the type, for example "fix(sync):".',
      'It doesn\'t end with the Jira key in square brackets, for example " [LP-64]".',
      'The summary starts with a capital letter; use lowercase ("merged thing…").',
      "The summary ends with a full stop; leave it off.",
    ]);
  });
});

describe("explain and headerOf", () => {
  it("shows the message, each problem, the format and an example", () => {
    const text = explain("Added stuff", checkHeader("Added stuff"), "Commit abc1234");
    expect(text).toContain("✖ Commit abc1234 doesn't follow the convention:");
    expect(text).toContain("    Added stuff");
    expect(text).toContain("Format:  " + FORMAT);
    expect(text).toContain("Example: " + EXAMPLE);
  });

  it("takes the first line of a message file that isn't a git comment", () => {
    expect(headerOf("# Please enter the commit message\n\nfix(sync): x [LP-64]\n\nbody")).toBe("fix(sync): x [LP-64]");
  });
});

describe("the command line (hook and CI)", () => {
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

  it("--file passes a good message and rejects a bad one with exit code 1", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "lawapp-commit-"));
    try {
      const good = path.join(dir, "good");
      writeFileSync(good, EXAMPLE + "\n\n# a comment\n");
      expect(run(["--file", good]).status).toBe(0);

      const bad = path.join(dir, "bad");
      writeFileSync(bad, "updated stuff\n");
      const r = run(["--file", bad]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Commit message doesn't follow the convention");
      expect(r.stderr).toContain("Example: " + EXAMPLE);

      const fixup = path.join(dir, "fixup");
      writeFileSync(fixup, "fixup! fix(sync): merge conflicts per character [LP-64]\n");
      expect(run(["--file", fixup]).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--title checks $PR_TITLE", () => {
    expect(run(["--title"], { PR_TITLE: EXAMPLE }).status).toBe(0);
    const r = run(["--title"], { PR_TITLE: "LP-84 Commit checks" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("The pull request title doesn't follow the convention");
  });

  it("--range checks every commit in a range", () => {
    // HEAD~0..HEAD is empty, so it passes without depending on the history's depth.
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(run(["--range", `${head}..${head}`]).status).toBe(0);
  });

  it("prints usage for unknown arguments", () => {
    expect(run(["--nope"]).status).toBe(2);
  });
});
