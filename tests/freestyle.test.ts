// FreestyleRP settings (LP-70): the in-game year offset, plus courts.ts. Court
// wording is in the form data (tests/freestyle-wording.test.ts). Pure, no DOM.
import { describe, expect, it } from "vitest";
import { COURTHOUSES, courthouseFor, DEFAULT_COURTHOUSE } from "@/lib/courts";
import { gameDate, YEAR_OFFSET } from "@/lib/freestyle";

describe("gameDate", () => {
  it("is 36 years back", () => {
    expect(YEAR_OFFSET).toBe(-36);
  });

  it("returns a copy, leaving the real date alone", () => {
    const real = new Date("2026-06-15T00:00:00Z");
    const d = gameDate(real);
    expect(d).not.toBe(real);
    expect(real.getUTCFullYear()).toBe(2026);
  });

  it("shifts back 36 years (2026 -> 1990), preserving month/day", () => {
    const d = gameDate(new Date("2026-06-15T00:00:00Z"));
    expect(d.getUTCFullYear()).toBe(1990);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("rolls over with the real New Year (2027-01-01 -> 1991)", () => {
    const d = gameDate(new Date("2027-01-01T00:00:00Z"));
    expect(d.getUTCFullYear()).toBe(1991);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it("handles the Feb 29 leap-day edge: 2024 (leap) -> 1988 (also leap) keeps Feb 29", () => {
    const d = gameDate(new Date("2024-02-29T00:00:00Z"));
    expect(d.getUTCFullYear()).toBe(1988);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(29);
  });

  it("normalises Feb 29 when the target year is not a leap year", () => {
    // -36 never maps a leap day to a non-leap year, so test the rule with a -2 offset.
    const d = gameDate(new Date("2024-02-29T00:00:00Z"), -2);
    // 2022 is not a leap year; native Date rolls Feb 29 -> Mar 1.
    expect(d.getUTCFullYear()).toBe(2022);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(1);
  });
});

describe("courts (LP-68)", () => {
  it("has one generic courthouse, Superior Court (SC), and nothing from GTAW", () => {
    expect(COURTHOUSES).toEqual([{ code: "SC", name: "SUPERIOR COURT" }]);
    expect(DEFAULT_COURTHOUSE.code).toBe("SC");
    expect(JSON.stringify(COURTHOUSES)).not.toMatch(/JOPLIN|DAVIS|"GJ"|"VD"/);
  });

  it("names the courthouse in one of our case numbers, and not in an old GTAW one", () => {
    expect(courthouseFor("90SCCR00147")?.name).toBe("SUPERIOR COURT");
    expect(courthouseFor("90scCR00147")?.name).toBe("SUPERIOR COURT");
    expect(courthouseFor("26GJCR00147")).toBeUndefined();
    expect(courthouseFor("26VDCC00012")).toBeUndefined();
    expect(courthouseFor("")).toBeUndefined();
    expect(courthouseFor(undefined)).toBeUndefined();
  });
});
