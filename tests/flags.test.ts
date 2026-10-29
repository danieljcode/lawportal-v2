// @vitest-environment jsdom
// Feature flags (LP-120): off unless the address names them, and a flagged program is listed only
// while its flag is on.
import { afterEach, describe, expect, it } from "vitest";
import { FLAGS, flagOn, flagsIn, type Flag } from "@/lib/flags";
import { shown } from "@/shell/registry";

// No real flag may exist when this runs, so the tests use a stand-in name.
const draft = "draft" as Flag;

afterEach(() => history.replaceState(null, "", "/"));

describe("feature flags", () => {
  it("reads the flags named in ?flags=", () => {
    expect([...flagsIn("?flags=ledger, find,,")]).toEqual(["ledger", "find"]);
    expect(flagsIn("").size).toBe(0);
    expect(flagsIn("?other=ledger").size).toBe(0);
  });

  it("is off unless this page's address turns it on", () => {
    expect(flagOn(draft)).toBe(false);
    history.replaceState(null, "", "/?flags=draft#cases");
    expect(flagOn(draft)).toBe(true);
    expect(flagOn(draft, "?flags=drafts")).toBe(false);
  });

  it("hides a flagged program until its flag is on", () => {
    const program = { visible: () => true, flag: draft };
    const commissioner = { commissioner: false };
    expect(shown(program, commissioner)).toBe(false);
    history.replaceState(null, "", "/?flags=draft");
    expect(shown(program, commissioner)).toBe(true);
    // The flag never overrides who may see it.
    expect(shown({ ...program, visible: () => false }, commissioner)).toBe(false);
    expect(shown({ visible: () => true }, commissioner)).toBe(true);
  });

  it("ties every flag to its Jira issue", () => {
    const flags: Record<string, { jira: string }> = FLAGS;
    for (const [name, { jira }] of Object.entries(flags)) expect(jira, name).toMatch(/^LP-\d+$/);
  });
});
