// Server-profile logic (FEAT-001): year offset and the getServer fallback, plus
// courts.ts. Court wording is in the form data (tests/freestyle-wording.test.ts).
// Pure module, no DOM.
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER, getServer, getServerDate, SERVER_ORDER, SERVERS, type ServerProfile } from "@/lib/servers";
import { COURTHOUSES, courthouseFor, DEFAULT_COURTHOUSE } from "@/lib/courts";

const gtaw: ServerProfile = SERVERS.gtaw;
const freestyle: ServerProfile = SERVERS.freestyle;

describe("servers config", () => {
  it("exposes the two profiles with the expected offsets and labels", () => {
    expect(SERVER_ORDER).toEqual(["gtaw", "freestyle"]);
    expect(DEFAULT_SERVER).toBe("gtaw");
    expect(gtaw.name).toBe("GTAW");
    expect(gtaw.yearOffset).toBe(0);
    expect(freestyle.name).toBe("FreestyleRP");
    expect(freestyle.yearOffset).toBe(-36);
  });
});

describe("getServer fallback", () => {
  it("resolves known ids and falls back to gtaw for unknown/absent", () => {
    expect(getServer("gtaw")).toBe(gtaw);
    expect(getServer("freestyle")).toBe(freestyle);
    expect(getServer(undefined)).toBe(gtaw);
    expect(getServer(null)).toBe(gtaw);
    expect(getServer("nope")).toBe(gtaw);
    expect(getServer("")).toBe(gtaw);
  });
});

describe("getServerDate", () => {
  it("leaves gtaw dates unchanged", () => {
    const real = new Date("2026-06-15T00:00:00Z");
    const d = getServerDate(real, gtaw);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
    // Returns a copy, not the same object.
    expect(d).not.toBe(real);
    expect(d.getTime()).toBe(real.getTime());
  });

  it("shifts freestyle back 36 years (2026 -> 1990), preserving month/day", () => {
    const d = getServerDate(new Date("2026-06-15T00:00:00Z"), freestyle);
    expect(d.getUTCFullYear()).toBe(1990);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("rolls over with the real New Year (2027-01-01 -> 1991)", () => {
    const d = getServerDate(new Date("2027-01-01T00:00:00Z"), freestyle);
    expect(d.getUTCFullYear()).toBe(1991);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it("handles the Feb 29 leap-day edge: 2024 (leap) -> 1988 (also leap) keeps Feb 29", () => {
    const d = getServerDate(new Date("2024-02-29T00:00:00Z"), freestyle);
    expect(d.getUTCFullYear()).toBe(1988);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(29);
  });

  it("normalises Feb 29 when the target year is not a leap year", () => {
    // 2026 is not a leap year, so a 2062 Feb 29 (offset +36 the other way is not
    // our case) — instead test a non-leap mapping directly via a custom profile.
    const toNonLeap: ServerProfile = { id: "freestyle", name: "X", yearOffset: -2 };
    const d = getServerDate(new Date("2024-02-29T00:00:00Z"), toNonLeap);
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
