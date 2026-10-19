// FreestyleRP wording baked into the forms by port-forms (LP-69): court names,
// court phrases and courthouses, and no GTAW wording left in the form data.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { COURTS } from "@/data";
import { APPELLATE_COURT, DIVISION_COURTS, GENERAL_COURT, SUPREME_COURT } from "@/lib/courts";
import { compile, render } from "@/lib/template";
import { COURT_NAMES, toFreestyle } from "../scripts/freestyle-wording.mjs";

const html = (h: string) => toFreestyle({ id: "x", court: "Miscellaneous", section: "", title: "", html: h }).html;

describe("court names", () => {
  it("maps every reference court to its FreestyleRP name from courts.ts", () => {
    expect(COURT_NAMES).toEqual({
      "Superior Court of San Andreas - Criminal Division": "San Andreas Criminal Court",
      "Superior Court of San Andreas - Civil Division": "San Andreas Civil Court",
      "Superior Court of San Andreas - Traffic Division": "San Andreas Traffic Court",
      "Superior Court of San Andreas - Small Claims Division": "San Andreas Small Claims Court",
      "Appellate Court of San Andreas": "San Andreas Appellate Court",
      "Supreme Court of San Andreas": "San Andreas Supreme Court",
      Miscellaneous: "San Andreas Court",
    });
  });

  it("leaves a court it doesn't know unchanged", () => {
    expect(toFreestyle({ id: "x", court: "Additional Templates", section: "", title: "", html: "" }).court).toBe(
      "Additional Templates",
    );
  });

  it("the forms' courts are all FreestyleRP names", () => {
    const allowed = new Set([
      ...Object.values(DIVISION_COURTS),
      APPELLATE_COURT,
      SUPREME_COURT,
      GENERAL_COURT,
      "Additional Templates",
    ]);
    for (const f of ALL_FORMS) expect(allowed, f.id).toContain(f.court);
    expect(COURTS).not.toContain("Miscellaneous");
  });
});

describe("court phrases in the template HTML", () => {
  it("replaces the all-caps Superior Court header (and the &nbsp; variant)", () => {
    expect(html("<p>SUPERIOR COURT OF THE STATE OF SAN ANDREAS</p>")).toBe("<p>SAN ANDREAS COURT</p>");
    expect(html("<p>SUPERIOR&nbsp;COURT OF THE STATE OF SAN ANDREAS</p>")).toBe("<p>SAN ANDREAS COURT</p>");
    expect(html("<strong>SUPERIOR COURT OF SAN ANDREAS, COUNTY OF:</strong>")).toBe(
      "<strong>SAN ANDREAS COURT, COUNTY OF:</strong>",
    );
  });

  it("replaces mixed-case Superior Court phrases", () => {
    expect(html("Superior Court of San Andreas, County of Los Santos")).toBe("SAN ANDREAS COURT, County of Los Santos");
    expect(html("Superior Court of the State of San Andreas has issued an order")).toBe(
      "SAN ANDREAS COURT has issued an order",
    );
  });

  it("replaces Appellate and Supreme phrases before the general Superior one can swallow them", () => {
    expect(
      html("APPELLATE COURT OF SAN ANDREAS and SUPREME COURT OF SAN ANDREAS and SUPERIOR COURT OF SAN ANDREAS"),
    ).toBe("SAN ANDREAS APPELLATE COURT and SAN ANDREAS SUPREME COURT and SAN ANDREAS COURT");
  });

  it("prefixes 'Small Claims Court' with the state", () => {
    expect(html("the Small Claims Court")).toBe("the San Andreas Small Claims Court");
  });
});

describe("courthouses (from courts.ts)", () => {
  it("puts our courthouse in case-number prefills and fallbacks, for every division", () => {
    for (const div of ["CR", "CC", "TC", "SM", "XX"]) {
      expect(html(`{{Case number=YYGJ${div}00XXX|YYGJ${div}#####}}`)).toBe(
        `{{Case number=YYSC${div}00XXX|YYSC${div}#####}}`,
      );
    }
    expect(html("{{Case number=YYGJ<Division?A=CR>00XXX|##GJCR#####}}")).toBe(
      "{{Case number=YYSC<Division?A=CR>00XXX|##SCCR#####}}",
    );
    expect(html("{{Case number=YYGJCC00XXX|--GJCC-----}}")).toBe("{{Case number=YYSCCC00XXX|--SCCC-----}}");
  });

  it("gives the worked example an in-game year", () => {
    expect(html('for example "26GJSM00001 filing fee"')).toBe('for example "90SCSM00001 filing fee"');
  });

  it("leaves other courts' codes alone", () => {
    for (const p of ["YYSCWC00XXX", "YYAPCR#####", "YYLSTC#####", "YYARCC#####"]) expect(html(p)).toBe(p);
  });

  it("builds the Courthouse dropdown from our courthouses", () => {
    expect(html("{{Courthouse:select:GREG E JOPLIN;VINCENT SHROEDER DAVIS|GREG E JOPLIN}}")).toBe(
      "{{Courthouse:select:SUPERIOR COURT|SUPERIOR COURT}}",
    );
  });

  it("renames the Greg E. Joplin courthouse in prose and headings", () => {
    expect(html("stored in the Greg E. Joplin Courthouse archive")).toBe("stored in the Superior Court archive");
    expect(html("at the Greg E. Joplin Court House.")).toBe("at the Superior Court.");
    expect(html("<em>GREG E. JOPLIN COURTHOUSE</em>")).toBe("<em>SUPERIOR COURT</em>");
  });
});

describe("the forms as shipped", () => {
  it.each(ALL_FORMS.map((f) => [f.id, f.html]))("%s has no GTAW court or courthouse wording", (_id, h) => {
    expect(h).not.toMatch(/JOPLIN|SHROEDER|VINCENT|(?:YY|##|--|\d\d)GJ/i);
    expect(h).not.toMatch(/SUPERIOR(?:&nbsp;|\s)+COURT OF (?:THE STATE OF )?SAN ANDREAS/i);
    expect(h).not.toMatch(/(?:APPELLATE|SUPREME) COURT OF SAN ANDREAS/i);
  });

  it("renders FreestyleRP wording with no translation step", () => {
    const out = render(compile(ALL_FORMS.find((f) => f.id === "criminal-arraignment")!.html), {});
    expect(out).toContain("SAN ANDREAS COURT");
    expect(out).not.toMatch(/SUPERIOR\s*(?:&nbsp;)?COURT OF/i);
    const extra = render(compile(ALL_FORMS.find((f) => f.id === "extra-general-motion")!.html), {});
    expect(extra).toContain("SAN ANDREAS COURT, COUNTY OF LOS SANTOS");
  });
});
