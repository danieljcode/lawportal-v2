// Case outcomes and the Firm Record (LP-92): cleaning, keeping an outcome through
// save and sync, totals and win rates, filters, and the summary.
import { describe, expect, it } from "vitest";
import { cleanCase, unifyCases } from "@/lib/cases";
import { firmRecord, matterOf, recordSummary, winRate } from "@/lib/firmRecord";
import { cleanOutcome } from "@/lib/outcomes";
import type { Case, Character } from "@/lib/types";

const kase = (over: Record<string, unknown>): Case =>
  cleanCase({ caseNumber: "90SCCR00001", status: "Closed", lead: "alice001", ...over });
const won = (date = "1990-10-10") => ({ result: "won", date });
const lost = (date = "1990-10-11") => ({ result: "lost", date });

const people = [
  { id: "alice001", name: "Alice", title: "Attorney at Law" },
  { id: "bob00001", name: "Bob", title: "Attorney at Law" },
  { id: "judge001", name: "Judy", title: "Judge" },
] as Character[];

describe("an outcome", () => {
  it("needs a known result and a game date, and keeps a note", () => {
    expect(cleanOutcome({ result: "plea", date: "1990-10-10", note: " Deal " })).toEqual({
      result: "plea",
      date: "1990-10-10",
      note: "Deal",
    });
    expect(cleanOutcome({ result: "plea", date: "1990-10-10", note: " " })).toEqual({
      result: "plea",
      date: "1990-10-10",
    });
    expect(cleanOutcome({ result: "constructor", date: "1990-10-10" })).toBeNull();
    expect(cleanOutcome({ result: "won", date: "soon" })).toBeNull();
    expect(cleanOutcome("won")).toBeNull();
  });

  it("stays with its case, and a sync keeps it when the newer copy has none", () => {
    const c = kase({ id: "case0001", outcome: won() });
    expect(c.outcome).toEqual(won());
    expect(kase({})).not.toHaveProperty("outcome");
    const newer = { ...kase({ id: "case0001" }), updated: "2026-10-02T00:00:00.000Z" };
    const older = { ...c, updated: "2026-10-01T00:00:00.000Z" };
    expect(unifyCases([newer], [older])[0].outcome).toEqual(won());
  });
});

describe("the Firm Record", () => {
  const cases = [
    kase({ id: "case0001", caseNumber: "90SCCR00001", assigned: ["bob00001"], outcome: won("1990-10-10") }),
    kase({ id: "case0002", caseNumber: "90SCCC00002", outcome: lost("1990-10-11") }),
    kase({
      id: "case0003",
      caseNumber: "90SCTC00003",
      lead: "bob00001",
      outcome: { result: "settled", date: "1990-09-01" },
    }),
    kase({ id: "case0004", caseNumber: "90SCCR00004", lead: "judge001", outcome: won("1990-10-12") }),
    kase({ id: "case0005", caseNumber: "90SCCR00005", status: "Open", outcome: won() }),
    kase({ id: "case0006", caseNumber: "90SCCR00006" }),
    kase({ id: "case0007", caseNumber: "90SCCR00007", lead: "gone0001", outcome: lost("1990-10-01") }),
  ];

  it("counts closed cases with an outcome; reopened ones and those with none don't", () => {
    const r = firmRecord(cases, people);
    expect(r.firm).toMatchObject({ cases: 5, won: 2, lost: 2, settled: 1 });
    expect(r.unrecorded.map((c) => c.id)).toEqual(["case0006"]);
  });

  it("gives each lawyer their cases, latest first, and leaves judges out", () => {
    const r = firmRecord(cases, people);
    expect(r.lawyers.map((l) => [l.name, l.tally.cases])).toEqual([
      ["Alice", 2],
      ["Bob", 2],
      ["Unknown character", 1],
    ]);
    expect(r.lawyers[0].cases.map((c) => c.id)).toEqual(["case0002", "case0001"]);
  });

  it("works out the win rate from cases won or lost only", () => {
    const r = firmRecord(cases, people);
    expect(winRate(r.firm)).toBe(50);
    expect(winRate(r.lawyers[0].tally)).toBe(50);
    expect(winRate(firmRecord([cases[2]], people).firm)).toBeNull();
  });

  it("filters by matter type and dates, both inclusive", () => {
    expect(matterOf(cases[0])).toBe("Criminal");
    expect(matterOf(cases[1])).toBe("Civil");
    expect(matterOf(cases[2])).toBe("Traffic");
    expect(matterOf({ caseNumber: "X1" })).toBe("Other");
    expect(firmRecord(cases, people, { matter: "Civil" }).firm.cases).toBe(1);
    expect(firmRecord(cases, people, { matter: "Civil" }).unrecorded).toEqual([]);
    expect(firmRecord(cases, people, { from: "1990-10-10", to: "1990-10-11" }).firm).toMatchObject({
      cases: 2,
      won: 1,
      lost: 1,
    });
  });

  it("sums up as a few lines of text", () => {
    const f = { matter: "Civil", from: "1990-10-01" };
    expect(recordSummary("F&A", firmRecord(cases, people, f), f)).toBe(
      "F&A record (Civil, from Thu 1 Oct 1990)\n" +
        "The firm: 1 case, 1 lost, win rate 0%\n" +
        "Alice: 1 case, 1 lost, win rate 0%",
    );
  });
});
