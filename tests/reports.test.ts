// Partner reports (LP-34): hours per character, revenue by month, open cases by status, and CSV.
import { describe, expect, it } from "vitest";
import { cleanCase } from "@/lib/cases";
import { createInvoiceStore } from "@/lib/invoices";
import { cleanEntry, type TimeEntry } from "@/lib/ledger";
import { casesReport, hoursReport, reportCsv, revenueReport } from "@/lib/reports";
import { memoryKV } from "@/lib/storage";

const T0 = "2026-10-29T10:00:00.000Z";
const entry = (id: string, o: Partial<TimeEntry>) =>
  cleanEntry({
    caseId: "case0001",
    character: "alice001",
    date: "1990-10-02",
    hours: 1,
    activity: "court",
    created: T0,
    id,
    ...o,
  })!;
const names: Record<string, string> = { alice001: "Alice", bob00001: "Bob" };
const nameOf = (id: string) => names[id];

describe("billable hours", () => {
  const entries = [
    entry("time0001", { hours: 1.5 }),
    entry("time0002", { hours: 2, date: "1990-11-05" }),
    entry("time0003", { hours: 4, character: "bob00001" }),
  ];
  const rateOf = (e: TimeEntry) => (e.character === "alice001" ? 100 : null);

  it("totals each character's hours and value, most hours first", () => {
    const r = hoursReport(entries, {}, nameOf, rateOf);
    expect(r.rows).toEqual([
      ["Bob", "4.0", "$0.00"],
      ["Alice", "3.5", "$350.00"],
    ]);
    expect(r.bars).toEqual([4, 3.5]);
  });

  it("filter by date range and character", () => {
    expect(hoursReport(entries, { to: "1990-10-31" }, nameOf, rateOf).rows.map((r) => r[1])).toEqual(["4.0", "1.5"]);
    expect(hoursReport(entries, { character: "alice001" }, nameOf, rateOf).rows).toEqual([["Alice", "3.5", "$350.00"]]);
  });
});

describe("revenue by month", () => {
  it("bills by the month issued and receives by the month paid", () => {
    const store = createInvoiceStore(memoryKV());
    const make = (id: string, date: string) =>
      store.create({
        caseId: "case0001",
        caseNumber: "90SCCR00147",
        date,
        entries: [entry(id, {})],
        rateOf: () => 100,
        nameOf,
      });
    const oct = make("time0001", "1990-10-20");
    make("time0002", "1990-11-03");
    store.addPayment(oct.id, { date: "1990-11-10", amount: 60 });
    expect(revenueReport(store.list(), {}).rows).toEqual([
      ["October 1990", "$100.00", "$0.00"],
      ["November 1990", "$100.00", "$60.00"],
    ]);
    expect(revenueReport(store.list(), { from: "1990-11-01" }).rows).toEqual([["November 1990", "$100.00", "$60.00"]]);
  });
});

describe("open cases by status", () => {
  it("counts cases not closed, the character's own when filtered", () => {
    const base = { updated: T0, lead: "alice001" };
    const cases = [
      cleanCase({ ...base, id: "case0001", caseNumber: "A1", status: "Open" }),
      cleanCase({ ...base, id: "case0002", caseNumber: "A2", status: "Awaiting judgement", lead: "bob00001" }),
      cleanCase({ ...base, id: "case0003", caseNumber: "A3", status: "Closed" }),
    ];
    expect(casesReport(cases, {}).rows).toEqual([
      ["Open", "1"],
      ["Awaiting arguments", "0"],
      ["Awaiting judgement", "1"],
    ]);
    expect(casesReport(cases, { character: "bob00001" }).bars).toEqual([0, 0, 1]);
  });
});

describe("CSV", () => {
  it("quotes commas and quotes, and keeps a typed formula from running", () => {
    const csv = reportCsv({
      title: "",
      columns: ["Character", "Value"],
      rows: [['=HYPERLINK("x")', "$1,200.00"]],
      bars: [1],
    });
    expect(csv).toBe('Character,Value\r\n"\'=HYPERLINK(""x"")","$1,200.00"\r\n');
  });
});
