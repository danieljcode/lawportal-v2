// FreestyleRP settings (LP-70): game time (LP-135), plus courts.ts. Court
// wording is in the form data (tests/freestyle-wording.test.ts). Pure, no DOM.
// tests/gameTimeZones.test.ts runs the LP-135 cases under other machine time zones.
import { describe, expect, it } from "vitest";
import { COURTHOUSES, courthouseFor, DEFAULT_COURTHOUSE } from "@/lib/courts";
import { gameTime, YEAR_OFFSET } from "@/lib/freestyle";

describe("gameTime", () => {
  it("is 36 years back", () => {
    expect(YEAR_OFFSET).toBe(-36);
  });

  it("is New York's date and time, year minus 36", () => {
    // 10 pm Sunday 25 Oct in New York (EDT, UTC-4).
    expect(gameTime(new Date("2026-10-26T02:00:00Z"))).toEqual({ date: "1990-10-25", time: "22:00" });
    // 11:30 pm Saturday 24 Oct.
    expect(gameTime(new Date("2026-10-25T03:30:00Z"))).toEqual({ date: "1990-10-24", time: "23:30" });
    // Winter is EST, UTC-5.
    expect(gameTime(new Date("2026-12-15T12:05:00Z"))).toEqual({ date: "1990-12-15", time: "07:05" });
  });

  it("rolls over with New York's New Year, not UTC's", () => {
    expect(gameTime(new Date("2027-01-01T03:00:00Z")).date).toBe("1990-12-31");
    expect(gameTime(new Date("2027-01-01T05:00:00Z"))).toEqual({ date: "1991-01-01", time: "00:00" });
  });

  it("keeps Feb 29: a real leap day maps to a 1990s leap day", () => {
    expect(gameTime(new Date("2024-02-29T17:00:00Z")).date).toBe("1988-02-29");
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
