// The jump box's search (LP-128): programs, sections and court forms by name,
// best matches first.
import { describe, expect, it } from "vitest";
import { matchScore, MAX_RESULTS, normalize, search, type JumpEntry } from "@/lib/jump";

const entry = (kind: JumpEntry["kind"], label: string, detail = ""): JumpEntry => ({
  id: kind + "-" + normalize(label).replace(/ /g, "-"),
  kind,
  label,
  detail,
  href: "#" + label,
});

const ENTRIES: JumpEntry[] = [
  entry("program", "Court Filings"),
  entry("program", "Case File"),
  entry("program", "Law Library"),
  entry("program", "J.A.P."),
  entry("section", "All cases", "Case File"),
  entry("section", "Upcoming", "Case File"),
  entry("section", "Precedents", "Law Library"),
  entry("form", "Arraignment", "San Andreas Criminal Court · Prosecution Forms"),
  entry("form", "Motion to Dismiss for a Speedy Trial Violation", "San Andreas Criminal Court · Defendant Forms"),
  entry("form", "General Motion", "Additional Templates · Motions"),
  entry("form", "Civil Complaint", "San Andreas Civil Court · Plaintiff Forms"),
];

const labels = (q: string) => search(q, ENTRIES).map((e) => e.label);

describe("normalize", () => {
  it("drops case and punctuation and folds hyphens and spaces", () => {
    expect(normalize("J.A.P.")).toBe("jap");
    expect(normalize("  Speedy-Trial  Violation ")).toBe("speedy trial violation");
    expect(normalize("Friedman & Associates")).toBe("friedman associates");
  });
});

describe("matchScore", () => {
  it("ranks the whole name, then its start, a word's start, every word, inside, where it is, letters in order", () => {
    const m = (q: string, label: string, detail = "") => matchScore(q, { label, detail });
    expect(m("upcoming", "Upcoming")).toBe(0);
    expect(m("upc", "Upcoming")).toBe(1);
    expect(m("dismiss", "Motion to Dismiss")).toBe(2);
    expect(m("mot dis", "Motion to Dismiss")).toBe(3);
    expect(m("raign", "Arraignment")).toBe(4);
    expect(m("criminal", "Arraignment", "San Andreas Criminal Court")).toBe(5);
    expect(m("mtd", "Motion to Dismiss")).toBe(6);
    expect(m("zzz", "Motion to Dismiss")).toBeNull();
  });
});

describe("search", () => {
  it("lists the programs and sections, not the forms, before anything is typed", () => {
    expect(labels("")).toEqual([
      "Court Filings",
      "Case File",
      "Law Library",
      "J.A.P.",
      "All cases",
      "Upcoming",
      "Precedents",
    ]);
  });

  it("finds programs, sections and forms by name, best first", () => {
    expect(labels("jap")).toEqual(["J.A.P."]);
    expect(labels("upcoming")[0]).toBe("Upcoming");
    expect(labels("prec")[0]).toBe("Precedents");
    expect(labels("arraign")).toEqual(["Arraignment"]);
    expect(labels("speedy")).toEqual(["Motion to Dismiss for a Speedy Trial Violation"]);
  });

  it("puts a name that starts with the query before one that only contains it", () => {
    // "General Motion" has a word starting "motion"; the speedy trial motion starts with it.
    expect(labels("motion")).toEqual(["Motion to Dismiss for a Speedy Trial Violation", "General Motion"]);
  });

  it("puts programs before sections before forms when they match as well", () => {
    // Upcoming only matches through the program it's in, so it comes last.
    expect(labels("case")).toEqual(["Case File", "All cases", "Upcoming"]);
    expect(labels("c")[0]).toBe("Court Filings");
  });

  it("finds a form by its court or section", () => {
    expect(labels("defendant forms")).toEqual(["Motion to Dismiss for a Speedy Trial Violation"]);
  });

  it("returns nothing for no match, and at most MAX_RESULTS", () => {
    expect(labels("qqq")).toEqual([]);
    const many = Array.from({ length: MAX_RESULTS + 10 }, (_, i) => entry("form", "Form " + i));
    expect(search("form", many)).toHaveLength(MAX_RESULTS);
  });
});
