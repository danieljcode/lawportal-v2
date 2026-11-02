// What needs attention (LP-171): deadlines, dated next actions and unpaid
// invoices as one list, overdue first, then by date and kind; My work against
// All firm work.
import { describe, expect, it } from "vitest";
import { cleanCase } from "@/lib/cases";
import type { Invoice } from "@/lib/invoices";
import type { Case } from "@/lib/types";
import { workItems } from "@/lib/work";

const TODAY = "1990-10-19";

const kase = (over: Record<string, unknown>): Case =>
  cleanCase({ caseNumber: "90SCCR00147", lead: "alice001", ...over });

const invoice = (over: Partial<Invoice>): Invoice => ({
  id: "inv00001",
  number: "FA-1990-0001",
  caseId: "case0001",
  caseNumber: "90SCCR00147",
  date: "1990-10-01",
  lines: [
    { entryId: "ent00001", date: "1990-10-01", who: "Alice", activity: "court", hours: 1, rate: 100, amount: 100 },
  ],
  payments: [],
  created: "2026-10-01T00:00:00.000Z",
  updated: "2026-10-01T00:00:00.000Z",
  ...over,
});

const keys = (items: ReturnType<typeof workItems>) => items.map((i) => i.key);

describe("the work list", () => {
  const cases = [
    kase({
      id: "case0001",
      deadlines: [
        { id: "dl000001", date: "1990-10-21", label: "Hearing" },
        { id: "dl000002", date: "1990-10-10", label: "Late", done: true },
        { id: "dl000003", date: "1990-11-30", label: "Too far" },
      ],
      actions: [
        { id: "ac000001", title: "Call", owner: "alice001", due: "1990-10-21" },
        { id: "ac000002", title: "Bob's", owner: "bob00001", due: "1990-10-18" },
        { id: "ac000003", title: "No date", owner: "alice001" },
        { id: "ac000004", title: "Done", owner: "alice001", due: "1990-10-18", done: true },
      ],
    }),
    kase({
      id: "case0002",
      caseNumber: "90SCCR00200",
      lead: "carl0001",
      deadlines: [{ id: "dl000004", date: "1990-10-20", label: "Carl's" }],
      actions: [{ id: "ac000005", title: "For Alice", owner: "alice001", due: "1990-10-25" }],
    }),
  ];
  const invoices = [
    invoice({}), // due 31 Oct
    invoice({ id: "inv00002", number: "FA-1990-0002", caseId: "case0002", date: "1990-09-01" }), // overdue
    invoice({
      id: "inv00003",
      number: "FA-1990-0003",
      payments: [{ id: "pay00001", date: "1990-10-02", amount: 100, method: "cash" }],
    }),
  ];

  it("lists the firm's work overdue first, then by date, a court date before an action on the same day", () => {
    expect(keys(workItems({ cases, invoices, charId: null, today: TODAY }))).toEqual([
      "invoice:inv00002",
      "action:case0001:ac000002",
      "deadline:case0002:dl000004",
      "deadline:case0001:dl000001",
      "action:case0001:ac000001",
      "action:case0002:ac000005",
      "invoice:inv00001",
    ]);
  });

  it("My work: deadlines and invoices on the character's cases, and actions given to them on any case", () => {
    expect(keys(workItems({ cases, invoices, charId: "alice001", today: TODAY }))).toEqual([
      "deadline:case0001:dl000001",
      "action:case0001:ac000001",
      "action:case0002:ac000005",
      "invoice:inv00001",
    ]);
  });

  it("marks overdue and soon, and carries an invoice's balance and due date", () => {
    const items = workItems({ cases, invoices, charId: null, today: TODAY });
    expect(items[0]).toMatchObject({ kind: "invoice", overdue: true, date: "1990-10-01", balance: 100 });
    expect(items[2]).toMatchObject({ overdue: false, soon: true });
    expect(items[5]).toMatchObject({ overdue: false, soon: false });
  });

  it("keeps an invoice whose case is gone in the firm's list only", () => {
    const orphan = [invoice({ caseId: "gone0001" })];
    const firm = workItems({ cases, invoices: orphan, charId: null, today: TODAY });
    expect(firm.filter((i) => i.kind === "invoice")).toMatchObject([{ key: "invoice:inv00001" }]);
    expect(firm.at(-1)).not.toHaveProperty("case");
    expect(keys(workItems({ cases: [], invoices: orphan, charId: "alice001", today: TODAY }))).toEqual([]);
  });
});
