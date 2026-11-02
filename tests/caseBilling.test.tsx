// @vitest-environment jsdom
// A case's billing summary and the Ledger scoped to the case (LP-173), through the whole App.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { contactStore } from "@/lib/contacts";
import { caseBilling, invoiceStore, type Invoice } from "@/lib/invoices";
import { rateLookup, timeStore, type TimeEntry } from "@/lib/ledger";
import { retainerStore } from "@/lib/retainers";
import * as sync from "@/lib/sync";
import { hashFor, parseHash } from "@/shell/useRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string, caseId: string, hours: number, character = "alice001") =>
  ({ id, caseId, character, date: "1990-10-01", hours, activity: "research", created: "", updated: "" }) as TimeEntry;

const invoice = (id: string, caseId: string, amounts: number[], paid: number[] = []) =>
  ({
    id,
    caseId,
    lines: amounts.map((amount, i) => ({ entryId: id + "line" + i, amount })),
    payments: paid.map((amount, i) => ({ id: id + "pay" + i, amount })),
    date: "1990-10-01",
    number: id,
  }) as unknown as Invoice;

describe("caseBilling", () => {
  const rateOf = rateLookup([], [{ id: "alice001", rate: "100" }]);

  it("adds up only this case's time and invoices", () => {
    const billed = entry("inv1line0", "case0001", 2);
    const b = caseBilling(
      "case0001",
      [billed, entry("free0001", "case0001", 1.5), entry("other001", "case0002", 9)],
      [invoice("inv1", "case0001", [200, 0.1], [50.05]), invoice("inv2", "case0002", [999], [999])],
      rateOf,
    );
    expect(b).toEqual({
      loggedHours: 3.5,
      unbilledHours: 1.5,
      unbilledValue: 150,
      unpriced: 0,
      invoiceCount: 1,
      invoiced: 200.1,
      paid: 50.05,
      outstanding: 150.05,
    });
  });

  it("counts time with no rate apart, as with a removed character", () => {
    const b = caseBilling("case0001", [entry("gone0001", "case0001", 2, "removed1")], [], rateOf);
    expect(b).toMatchObject({ unbilledHours: 2, unbilledValue: 0, unpriced: 1 });
  });

  it("doesn't let an overpaid invoice hide what another still owes", () => {
    const b = caseBilling(
      "case0001",
      [],
      [invoice("inv1", "case0001", [100], [150]), invoice("inv2", "case0001", [80])],
      rateOf,
    );
    expect(b).toMatchObject({ invoiced: 180, paid: 150, outstanding: 80 });
  });
});

describe("the route", () => {
  it.each(["#ledger/case/case0001", "#ledger/case/case0001/log", "#ledger/case/case0001/invoices"])("keeps %s", (h) => {
    expect(hashFor(parseHash(h))).toBe(h);
  });

  it("opens the plain Ledger for a bad id or page", () => {
    expect(parseHash("#ledger/case/BAD!")).toEqual({ program: "ledger" });
    expect(hashFor(parseHash("#ledger/case/case0001/nope"))).toBe("#ledger/case/case0001");
  });
});

describe("through the App", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let id = "";

  const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
  function must<T extends Element = HTMLElement>(sel: string): T {
    const el = document.querySelector<T>(sel);
    if (!el) throw new Error("missing " + sel);
    return el;
  }
  const go = (hash: string) =>
    act(async () => {
      history.pushState(null, "", hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await vi.dynamicImportSettled();
    });
  async function mount(hash: string): Promise<void> {
    history.replaceState(null, "", hash);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(App));
      await vi.dynamicImportSettled();
    });
  }

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    timeStore().replaceAll([]);
    invoiceStore().replaceAll([]);
    retainerStore().replaceAll([]);
    contactStore().replaceAll([]);
    caseStore().replaceAll([]);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", rate: "100" });
    characterStore().setActive("alice001");
    id = caseStore().save({ caseNumber: "90SCCR00147", lead: "alice001" }).id;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows an empty case's next steps, with no client linked", async () => {
    await mount("#cases/" + id);
    expect(must("#case-billing-empty").textContent).toContain("No time or invoices yet");
    expect(must<HTMLAnchorElement>("#case-billing-log").getAttribute("href")).toBe("#ledger/case/" + id + "/log");
    expect($("#case-actions")).not.toBeNull();
    expect(must<HTMLAnchorElement>("#case-filings-start").getAttribute("href")).toBe("#filings");
    expect($("#exhibit-new")).not.toBeNull();
  });

  it("follows new time and invoices, and leaves retainers out", async () => {
    await mount("#cases/" + id);
    await act(async () => {
      const e = timeStore().save({ caseId: id, character: "alice001", date: "1990-10-01", hours: 2 });
      const inv = invoiceStore().create({
        caseId: id,
        caseNumber: "90SCCR00147",
        date: "1990-10-02",
        entries: [e],
        rateOf: () => 100,
        nameOf: () => "Alice",
      });
      invoiceStore().addPayment(inv.id, { date: "1990-10-03", amount: 50 });
      timeStore().save({ caseId: id, character: "alice001", date: "1990-10-04", hours: 1 });
      const client = contactStore().save({ name: "Judy Reyes", type: "client" });
      contactStore().link(client.id, id, "client");
      retainerStore().deposit({ contactId: client.id, date: "1990-10-01", amount: 5000, method: "cash" });
    });
    expect(must("#case-billing-logged").textContent).toBe("3.0 hours");
    expect(must("#case-billing-unbilled").textContent).toBe("1.0 hour, worth $100.00");
    expect(must("#case-billing-invoiced").textContent).toBe("$200.00 on 1 invoice");
    expect(must("#case-billing-paid").textContent).toBe("$50.00");
    expect(must("#case-billing-outstanding").textContent).toBe("$150.00");
  });

  it("opens the Ledger on the case, logs time on it, and comes back to the same case", async () => {
    timeStore().save({ caseId: "other001", character: "alice001", date: "1990-10-01", hours: 9 });
    await mount("#cases/" + id);

    await go("#ledger/case/" + id + "/log");
    expect(must<HTMLSelectElement>("#time-case").value).toBe(id);
    expect(must<HTMLSelectElement>("#ledger-case").value).toBe(id);
    expect(must("#ledger-total").textContent).toContain("0.0 hours");
    expect(must("#invoice-new").textContent).toBe("Invoice 90SCCR00147");

    await go(must<HTMLAnchorElement>("#ledger-back-case").getAttribute("href")!);
    expect(location.hash).toBe("#cases/" + id);
    expect(must("#case-form-title").textContent).toBe("90SCCR00147");

    // The form closed, then a second Log time from the case opens it again.
    await go("#ledger/case/" + id);
    act(() => [...document.querySelectorAll<HTMLElement>("#time-form button")].at(-1)!.click());
    expect($("#time-form")).toBeNull();
    await go("#cases/" + id);
    await go("#ledger/case/" + id + "/log");
    expect($("#time-form")).not.toBeNull();
  });

  it("opens the whole Ledger when the case is gone", async () => {
    await mount("#ledger/case/gone0001");
    expect(must<HTMLSelectElement>("#ledger").id).toBe("ledger");
    expect($("#ledger-back-case")).toBeNull();
  });
});
