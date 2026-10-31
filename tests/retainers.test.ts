// Client retainers (LP-93): deposits, draws from invoice payments, the running
// history, the floor kept on the contact, and the top-up letter.
import { describe, expect, it } from "vitest";
import { createContactStore } from "@/lib/contacts";
import { cleanPayment, createInvoiceStore } from "@/lib/invoices";
import { cleanEntry } from "@/lib/ledger";
import { cleanDeposit, createRetainerStore, retainerBalance, retainerHistory, topUpLetterHtml } from "@/lib/retainers";
import { memoryKV } from "@/lib/storage";

const T0 = "2026-10-29T10:00:00.000Z";

describe("retainers", () => {
  it("run deposits in and retainer payments out, oldest first", () => {
    const kv = memoryKV();
    const deposits = createRetainerStore(kv);
    const invoices = createInvoiceStore(kv);
    deposits.deposit({ contactId: "judy0001", date: "1990-10-01", amount: 500, method: "cheque", note: "No. 7" });
    deposits.deposit({ contactId: "other001", date: "1990-10-01", amount: 999, method: "cash" });
    const entry = cleanEntry({
      id: "time0001",
      caseId: "case0001",
      character: "alice001",
      date: "1990-10-02",
      hours: 2,
      activity: "court",
      created: T0,
    })!;
    const inv = invoices.create({
      caseId: "case0001",
      caseNumber: "90SCCR00147",
      date: "1990-10-31",
      entries: [entry],
      rateOf: () => 150,
      nameOf: () => "Alice",
    });
    invoices.addPayment(inv.id, { date: "1990-11-02", amount: 300, method: "retainer", contactId: "judy0001" });
    invoices.addPayment(inv.id, { date: "1990-11-03", amount: 0.5, method: "cash" });

    const rows = retainerHistory("judy0001", deposits.list(), invoices.list());
    expect(rows.map((r) => [r.date, r.what, r.amount, r.balance])).toEqual([
      ["1990-10-01", "Deposit (Cheque): No. 7", 500, 500],
      ["1990-11-02", "Invoice FA-1990-0001", -300, 200],
    ]);
    expect(rows[0].depositId).toBeTruthy();
    expect(rows[1].depositId).toBeUndefined();
    expect(retainerBalance("judy0001", deposits.list(), invoices.list())).toBe(200);
    expect(retainerBalance("nobody01", deposits.list(), invoices.list())).toBe(0);
  });

  it("refuse a deposit without an amount, and never take one as a retainer draw", () => {
    const deposits = createRetainerStore(memoryKV());
    expect(() => deposits.deposit({ contactId: "judy0001", date: "1990-10-01", amount: 0, method: "cash" })).toThrow(
      /amount/,
    );
    expect(cleanDeposit({ contactId: "judy0001", date: "1990-10-01", amount: 5, method: "retainer" })?.method).toBe(
      "cash",
    );
  });

  it("read a retainer payment without a client as cash", () => {
    expect(cleanPayment({ date: "1990-10-01", amount: 5, method: "retainer" })?.method).toBe("cash");
    expect(cleanPayment({ date: "1990-10-01", amount: 5, method: "retainer", contactId: "judy0001" })).toMatchObject({
      method: "retainer",
      contactId: "judy0001",
    });
  });

  it("keep the client's floor when the Rolodex form saves the contact", () => {
    const contacts = createContactStore(memoryKV());
    const judy = contacts.save({ name: "Judy", type: "client" });
    contacts.save({ ...judy, retainerFloor: 250 });
    contacts.save({ id: judy.id, name: "Judy Reyes", type: "client" });
    expect(contacts.get(judy.id)).toMatchObject({ name: "Judy Reyes", retainerFloor: 250 });
  });

  it("write a top-up letter asking for at least the shortfall", () => {
    const html = topUpLetterHtml(
      { client: "Judy <Reyes>", balance: 120, floor: 500, date: "1990-10-31" },
      { firmName: "Friedman & Associates", address: "", phone: "", email: "" },
    );
    expect(html).toContain("Dear Judy &lt;Reyes&gt;,");
    expect(html).toContain("<strong>$120.00</strong>");
    expect(html).toContain("at least <strong>$380.00</strong>");
  });
});
