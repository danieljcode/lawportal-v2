// AC 25 (no cookie wording in storage/sync/J.A.P. texts) and the credit / no outside branding.
import { describe, expect, it } from "vitest";
import * as strings from "@/lib/strings";

const texts = (): Array<[string, string]> =>
  Object.entries(strings).flatMap(([name, v]): Array<[string, string]> => {
    if (typeof v === "string") return [[name, v]];
    if (typeof v === "function") return [[name, (v as (n: number) => string)(3)]];
    if (Array.isArray(v)) return [[name, v.join("")]];
    return [];
  });

describe("pinned strings", () => {
  it("exports every §Strings entry", () => {
    for (const name of [
      "S_DISCLAIMER",
      "S_DISCLAIMER_EMPTY",
      "S_CREDIT",
      "S_STORAGE_LOCAL",
      "S_STORAGE_MEMORY",
      "S_STORAGE_SYNC",
      "S_SYNC_OFF",
      "S_SYNC_ON",
      "S_SYNC_APPLY_FAIL",
      "S_JAP_OFF",
      "S_JAP_ON",
    ]) {
      expect(strings).toHaveProperty(name);
    }
  });

  it("storage, sync and J.A.P. texts never mention cookies", () => {
    const relevant = texts().filter(([name]) => /^S_(STORAGE|SYNC|JAP)_/.test(name));
    expect(relevant.length).toBeGreaterThanOrEqual(8);
    for (const [name, text] of relevant) expect(text, name).not.toMatch(/cookie/i);
  });

  it("fills the count into S_SYNC_APPLY_FAIL", () => {
    expect(strings.S_SYNC_APPLY_FAIL(2)).toBe("Couldn't store 2 synced character(s) in this browser.");
  });

  it("never mentions the old forum or outside branding", () => {
    for (const [name, text] of texts()) expect(text, name).not.toMatch(/gta\.?world|gtaw|awucard|https?:\/\//i);
  });

  it("credits Dan, without a link", () => {
    expect(strings.S_CREDIT).toBe("Made by Dan.");
  });
});
