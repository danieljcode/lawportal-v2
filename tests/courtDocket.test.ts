// The Court Docket's logic (LP-91): a case's standing and next date, the judge's
// cases, the filter and the order.
import { describe, expect, it } from "vitest";
import { cleanCase } from "@/lib/cases";
import { courtDocket, isJudge, nextDate } from "@/lib/courtDocket";
import type { Case } from "@/lib/types";

const TODAY = "1990-10-19";
const kase = (over: Record<string, unknown>): Case =>
  cleanCase({ caseNumber: "90SCCR00001", lead: "judge001", ...over });

describe("who is a judge", () => {
  it("goes by title, and a lawyer isn't one", () => {
    for (const title of ["Judge", "Associate Justice", "Court Commissioner", "Magistrate"]) {
      expect(isJudge({ title })).toBe(true);
    }
    for (const title of ["Attorney at Law", "Deputy Attorney, Department of Justice", "Clerk", undefined]) {
      expect(isJudge({ title })).toBe(false);
    }
    expect(isJudge(null)).toBe(false);
  });
});

describe("a case's next date", () => {
  it("is the soonest open deadline or Next date from today on", () => {
    const c = kase({
      nextDate: "1990-10-25",
      nextEvent: "Trial",
      deadlines: [
        { id: "dl000001", date: "1990-10-18", label: "Past" },
        { id: "dl000002", date: "1990-10-19", label: "Done", done: true },
        { id: "dl000003", date: "1990-10-21", label: "Hearing" },
      ],
    });
    expect(nextDate(c, TODAY)).toEqual({ date: "1990-10-21", label: "Hearing" });
    expect(nextDate(kase({ nextDate: "1990-10-25", nextEvent: "Trial" }), TODAY)).toEqual({
      date: "1990-10-25",
      label: "Trial",
    });
    expect(nextDate(kase({ nextDate: "1990-10-25" }), TODAY)?.label).toBe("Next date");
    expect(nextDate(kase({ nextDate: "1990-10-01" }), TODAY)).toBeNull();
  });
});

describe("the docket", () => {
  const cases = [
    kase({ id: "pend0001", caseNumber: "90SCCR00001" }),
    kase({ id: "late0001", caseNumber: "90SCCR00002", nextDate: "1990-11-01" }),
    kase({ id: "soon0001", caseNumber: "90SCCR00003", nextDate: "1990-10-20", assigned: [] }),
    kase({ id: "advi0001", caseNumber: "90SCCR00004", status: "Awaiting judgement" }),
    kase({ id: "clos0001", caseNumber: "90SCCR00005", status: "Closed", nextDate: "1990-10-20" }),
    kase({ id: "othe0001", caseNumber: "90SCCR00006", lead: "other001" }),
    kase({ id: "assi0001", caseNumber: "90SCCR00007", lead: "other001", assigned: ["judge001"] }),
  ];
  const ids = (standing?: Parameters<typeof courtDocket>[3]) =>
    courtDocket(cases, "judge001", TODAY, standing).map((r) => r.case.id);

  it("lists the judge's cases, led or assigned, soonest first; undated last, what awaits a ruling first", () => {
    expect(ids()).toEqual(["soon0001", "late0001", "advi0001", "pend0001", "assi0001", "clos0001"]);
  });

  it("filters by standing", () => {
    expect(ids("Pending")).toEqual(["pend0001", "assi0001"]);
    expect(ids("Scheduled")).toEqual(["soon0001", "late0001"]);
    expect(ids("Under advisement")).toEqual(["advi0001"]);
    expect(ids("Closed")).toEqual(["clos0001"]);
  });

  it("marks what awaits a ruling, and a closed case has no next date", () => {
    const rows = courtDocket(cases, "judge001", TODAY);
    expect(rows.filter((r) => r.awaitingRuling).map((r) => r.case.id)).toEqual(["advi0001"]);
    expect(rows.find((r) => r.case.id === "clos0001")!.next).toBeNull();
  });
});
