// Git worktrees in .worktrees/ (LP-134): another branch's checkout, so git, ESLint, Prettier and
// tsc all leave it to that branch's own checks.
import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

// isPathIgnored loads the whole ESLint config, which takes seconds while the rest of the suite runs.
describe("worktrees are left alone (LP-134)", { timeout: 30_000 }, () => {
  it("ESLint skips them", async () => {
    const eslint = new ESLint();
    expect(await eslint.isPathIgnored(".worktrees/LP-1-x/src/shell/App.tsx")).toBe(true);
    expect(await eslint.isPathIgnored("src/shell/App.tsx")).toBe(false);
  });

  it("git, Prettier and tsc skip them", () => {
    expect(read(".gitignore").split(/\r?\n/)).toContain("/.worktrees/");
    expect(read(".prettierignore").split(/\r?\n/)).toContain(".worktrees/");
    expect(JSON.parse(read("tsconfig.json")).exclude).toContain(".worktrees");
  });
});
