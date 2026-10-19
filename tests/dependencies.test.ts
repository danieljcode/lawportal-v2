// Dependency rules that a version bump could quietly break (LP-6 follow-up).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const all = { ...pkg.dependencies, ...pkg.devDependencies };

describe("pinned versions that must match", () => {
  it("playwright and @playwright/test are the same version (each needs its own browser build)", () => {
    expect(all["@playwright/test"]).toBe(all.playwright);
  });

  it("next and eslint-config-next are the same version", () => {
    expect(all["eslint-config-next"]).toBe(all.next);
  });
});
