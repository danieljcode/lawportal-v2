// The Ledger's invoices (LP-33): numbering, lines, payments, status and the sheet.
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanInvoice,
  createInvoiceStore,
  invoiceBalance,
  invoiceHtml,
  invoiceStatus,
  nextInvoiceNumber,
  type InvoiceDraft,
  type InvoiceStore,
} from "@/lib/invoices";
import { cleanEntry, type TimeEntry } from "@/lib/ledger";
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

const draft = (entries: TimeEntry[], o: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  caseId: "case0001",
  caseNumber: "90SCCR00147",
  from: "1990-10-01",
  to: "1990-10-31",
  date: "1990-10-31",
  entries,
  rateOf: (e) => (e.character === "alice001" ? 150 : null),
  nameOf: (id) => (id === "alice001" ? "Alice Lawyer" : "Bob"),
  ...o,
});

describe("invoice numbers", () => {
  it("count up within the game year, per prefix", () => {
    expect(nextInvoiceNumber([], "1990-10-31")).toBe("FA-1990-0001");
    const list = [{ number: "FA-1990-0007" }, { number: "FA-1989-0042" }, { number: "XX-1990-0099" }];
    expect(nextInvoiceNumber(list, "1990-12-01")).toBe("FA-1990-0008");
    expect(nextInvoiceNumber(list, "1991-01-02")).toBe("FA-1991-0001");
  });
});

describe("the invoice store", () => {
  let store: InvoiceStore;
  beforeEach(() => {
    store = createInvoiceStore(memoryKV());
  });

  it("bills a case's entries oldest first at their rate, and numbers it", () => {
    const inv = store.create(
      draft([entry("time0002", { date: "1990-10-20", hours: 2.5, note: "Trial" }), entry("time0001", {})]),
    );
    expect(inv.number).toBe("FA-1990-0001");
    expect(inv.lines.map((l) => [l.date, l.who, l.hours, l.amount])).toEqual([
      ["1990-10-02", "Alice Lawyer", 1, 150],
      ["1990-10-20", "Alice Lawyer", 2.5, 375],
    ]);
    expect(store.create(draft([entry("time0003", {})])).number).toBe("FA-1990-0002");
  });

  it("refuses an empty period, or time with no rate", () => {
    expect(() => store.create(draft([]))).toThrow(/no logged time/);
    expect(() => store.create(draft([entry("time0001", { character: "bob00001" })]))).toThrow(/1 entry has no rate/);
  });

  it("records payments: Unpaid, Part paid, Paid", () => {
    const inv = store.create(draft([entry("time0001", { hours: 2 })]));
    expect(invoiceStatus(inv)).toBe("Unpaid");
    expect(() => store.addPayment(inv.id, { date: "1990-11-01", amount: 0 })).toThrow(/amount/);
    store.addPayment(inv.id, { date: "1990-11-01", amount: 100.1, note: "Cheque" });
    expect(invoiceStatus(store.get(inv.id)!)).toBe("Part paid");
    expect(invoiceBalance(store.get(inv.id)!)).toBe(199.9);
    store.addPayment(inv.id, { date: "1990-11-02", amount: 199.9 });
    expect(invoiceStatus(store.get(inv.id)!)).toBe("Paid");
    store.removePayment(inv.id, store.get(inv.id)!.payments[0].id);
    expect(invoiceBalance(store.get(inv.id)!)).toBe(100.1);
  });

  it("cleans a synced invoice, recomputing each amount", () => {
    const inv = store.create(draft([entry("time0001", {})]));
    const tampered = { ...inv, lines: [{ ...inv.lines[0], amount: 1 }] };
    expect(cleanInvoice(tampered)?.lines[0].amount).toBe(150);
    expect(cleanInvoice({ ...inv, lines: [] })).toBeNull();
  });
});

describe("the invoice sheet", () => {
  it("lists the lines, totals and status, escaping what was typed", () => {
    const store = createInvoiceStore(memoryKV());
    const inv = store.create(draft([entry("time0001", { note: "<b>Bail</b> hearing" })]));
    store.addPayment(inv.id, { date: "1990-11-01", amount: 50 });
    const html = invoiceHtml(store.get(inv.id)!, {
      firmName: "Friedman & Associates",
      address: "",
      phone: "",
      email: "",
    });
    expect(html).toContain("INVOICE FA-1990-0001");
    expect(html).toContain("Friedman &amp; Associates");
    expect(html).toContain("Alice Lawyer: Court: &lt;b&gt;Bail&lt;/b&gt; hearing");
    expect(html).toContain("Period: Thu 1 Oct 1990 to Sat 31 Oct 1990");
    expect(html).toContain("<td>$150.00</td>");
    expect(html).toContain("<strong>$100.00</strong>");
    expect(html).toContain("Status: Part paid");
  });
});
