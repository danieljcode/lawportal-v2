// Server-profile logic (FEAT-001): year offset, court-name mapping (sidebar and
// template HTML), and the getServer fallback. Pure module, no DOM.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER,
  getServer,
  getServerDate,
  mapCourt,
  mapCourtHtml,
  SERVER_ORDER,
  SERVERS,
  stripGJ,
  type ServerProfile,
} from "@/lib/servers";
import { compile, render } from "@/lib/template";
import forms from "@/data/forms.json";
import { EXTRA_FORMS } from "@/data/extra-forms";
import type { FormDef } from "@/lib/types";

const gtaw: ServerProfile = SERVERS.gtaw;
const freestyle: ServerProfile = SERVERS.freestyle;

function findForm(id: string): FormDef {
  const all: FormDef[] = [...(forms as FormDef[]), ...EXTRA_FORMS];
  const f = all.find((x) => x.id === id);
  if (!f) throw new Error("missing form " + id);
  return f;
}

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
    const toNonLeap: ServerProfile = { id: "freestyle", name: "X", yearOffset: -2, courtNames: {}, caseNumberTransform: (p) => p };
    const d = getServerDate(new Date("2024-02-29T00:00:00Z"), toNonLeap);
    // 2022 is not a leap year; native Date rolls Feb 29 -> Mar 1.
    expect(d.getUTCFullYear()).toBe(2022);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(1);
  });
});

const SIDEBAR_COURTS: ReadonlyArray<[string, string]> = [
  ["Superior Court of San Andreas - Criminal Division", "San Andreas Criminal Court"],
  ["Superior Court of San Andreas - Civil Division", "San Andreas Civil Court"],
  ["Superior Court of San Andreas - Traffic Division", "San Andreas Traffic Court"],
  ["Superior Court of San Andreas - Small Claims Division", "San Andreas Small Claims Court"],
  ["Appellate Court of San Andreas", "San Andreas Appellate Court"],
  ["Supreme Court of San Andreas", "San Andreas Supreme Court"],
  ["Miscellaneous", "San Andreas Court"],
];

describe("mapCourt (sidebar/breadcrumb)", () => {
  it("is identity on gtaw for every court value", () => {
    for (const [court] of SIDEBAR_COURTS) expect(mapCourt(gtaw, court)).toBe(court);
    expect(mapCourt(gtaw, "Additional Templates")).toBe("Additional Templates");
  });

  it("maps every sidebar court to its FreestyleRP name", () => {
    for (const [court, mapped] of SIDEBAR_COURTS) expect(mapCourt(freestyle, court)).toBe(mapped);
  });

  it("leaves 'Additional Templates' and unknown values unchanged on freestyle", () => {
    expect(mapCourt(freestyle, "Additional Templates")).toBe("Additional Templates");
    expect(mapCourt(freestyle, "Some Other Court")).toBe("Some Other Court");
  });

  it("meets the acceptance-criterion exact string", () => {
    expect(mapCourt(freestyle, "Superior Court of San Andreas - Criminal Division")).toBe("San Andreas Criminal Court");
  });
});

describe("mapCourtHtml (template HTML phrases)", () => {
  it("is identity on gtaw", () => {
    const html = "<p>SUPERIOR COURT OF THE STATE OF SAN ANDREAS</p>";
    expect(mapCourtHtml(gtaw, html)).toBe(html);
  });

  it("replaces the all-caps Superior Court header (and the &nbsp; variant)", () => {
    expect(mapCourtHtml(freestyle, "<p>SUPERIOR COURT OF THE STATE OF SAN ANDREAS</p>")).toBe(
      "<p>SAN ANDREAS COURT</p>",
    );
    expect(mapCourtHtml(freestyle, "<p>SUPERIOR&nbsp;COURT OF THE STATE OF SAN ANDREAS</p>")).toBe(
      "<p>SAN ANDREAS COURT</p>",
    );
  });

  it("replaces 'SUPERIOR COURT OF SAN ANDREAS, COUNTY OF:' header", () => {
    expect(mapCourtHtml(freestyle, "<strong>SUPERIOR COURT OF SAN ANDREAS, COUNTY OF:</strong>")).toBe(
      "<strong>SAN ANDREAS COURT, COUNTY OF:</strong>",
    );
  });

  it("replaces mixed-case Superior Court phrases", () => {
    expect(mapCourtHtml(freestyle, "Superior Court of San Andreas, County of Los Santos")).toBe(
      "SAN ANDREAS COURT, County of Los Santos",
    );
    expect(mapCourtHtml(freestyle, "Superior Court of the State of San Andreas has issued an order")).toBe(
      "SAN ANDREAS COURT has issued an order",
    );
  });

  it("replaces Appellate and Supreme court phrases", () => {
    expect(mapCourtHtml(freestyle, "APPELLATE COURT OF SAN ANDREAS, COUNTY OF:")).toBe(
      "SAN ANDREAS APPELLATE COURT, COUNTY OF:",
    );
    expect(mapCourtHtml(freestyle, "Appellate Court of San Andreas on")).toBe("SAN ANDREAS APPELLATE COURT on");
    expect(mapCourtHtml(freestyle, "SUPREME COURT OF SAN ANDREAS")).toBe("SAN ANDREAS SUPREME COURT");
  });

  it("prefixes 'Small Claims Court' with the state", () => {
    expect(mapCourtHtml(freestyle, "the Small Claims Court")).toBe("the San Andreas Small Claims Court");
  });

  it("does not let the general Superior match swallow Appellate/Supreme phrases", () => {
    const html = "APPELLATE COURT OF SAN ANDREAS and SUPREME COURT OF SAN ANDREAS and SUPERIOR COURT OF SAN ANDREAS";
    expect(mapCourtHtml(freestyle, html)).toBe(
      "SAN ANDREAS APPELLATE COURT and SAN ANDREAS SUPREME COURT and SAN ANDREAS COURT",
    );
  });

  it("round-trips through compile+render: freestyle HTML shows mapped phrases, not originals", () => {
    const form = findForm("criminal-arraignment");
    const originalHtml = render(compile(form.html), {});
    expect(originalHtml).toContain("SUPERIOR");
    expect(originalHtml).toContain("SAN ANDREAS");

    const mapped = mapCourtHtml(freestyle, form.html);
    const mappedHtml = render(compile(mapped), {});
    expect(mappedHtml).not.toMatch(/SUPERIOR\s*(?:&nbsp;)?COURT OF (?:THE STATE OF )?SAN ANDREAS/i);
    expect(mappedHtml).toContain("SAN ANDREAS COURT");

    // gtaw keeps the original wording.
    const gtawHtml = render(compile(mapCourtHtml(gtaw, form.html)), {});
    expect(gtawHtml).toBe(originalHtml);
  });

  it("round-trips the extra-forms court-line token default on freestyle", () => {
    const form = findForm("extra-general-motion");
    const mapped = mapCourtHtml(freestyle, form.html);
    const html = render(compile(mapped), {});
    expect(html).not.toMatch(/SUPERIOR COURT OF THE STATE OF SAN ANDREAS/i);
    expect(html).toContain("SAN ANDREAS COURT");
  });
});

describe("caseNumberTransform / stripGJ", () => {
  it("gtaw is the identity (GJ = Greg Joplin, kept)", () => {
    for (const p of ["26GJCR00XXX", "26GJCC00XXX", "26GJTC00XXX", "26GJSM00XXX", "26SCWC00XXX"]) {
      expect(gtaw.caseNumberTransform(p)).toBe(p);
    }
  });

  it("freestyle strips the GJ that follows the year across all division letters", () => {
    expect(freestyle.caseNumberTransform("90GJCR00XXX")).toBe("90CR00XXX");
    expect(freestyle.caseNumberTransform("90GJCC00XXX")).toBe("90CC00XXX");
    expect(freestyle.caseNumberTransform("90GJTC00XXX")).toBe("90TC00XXX");
    expect(freestyle.caseNumberTransform("90GJSM00XXX")).toBe("90SM00XXX");
    // An "other"/unknown code is not special-cased: the GJ still goes, letters stay.
    expect(freestyle.caseNumberTransform("90GJZZ00XXX")).toBe("90ZZ00XXX");
  });

  it("freestyle leaves patterns without a GJ after the year untouched (SCWC edge case)", () => {
    expect(freestyle.caseNumberTransform("90SCWC00XXX")).toBe("90SCWC00XXX");
    // GJ not immediately after the year is not stripped.
    expect(freestyle.caseNumberTransform("90CRGJ00XXX")).toBe("90CRGJ00XXX");
  });

  it("stripGJ matches the freestyle transform and is case-insensitive on the GJ", () => {
    expect(stripGJ("26GJCR00XXX")).toBe("26CR00XXX");
    expect(stripGJ("26gjCR00XXX")).toBe("26CR00XXX");
    expect(stripGJ("26SCWC00XXX")).toBe("26SCWC00XXX");
  });
});
