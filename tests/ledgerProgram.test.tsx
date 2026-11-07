// @vitest-environment jsdom
// The Ledger page (LP-32): log time against a case, filter it, edit it and delete it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { caseStore } from "@/lib/cases";
import { contactStore } from "@/lib/contacts";
import { invoiceStore } from "@/lib/invoices";
import { retainerStore } from "@/lib/retainers";
import { timerStore, timeStore } from "@/lib/ledger";
import LedgerProgram from "@/programs/ledger";
import type { ProgramProps } from "@/shell/program";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const $ = (sel: string) => container.querySelector<HTMLElement>(sel);
function must<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = container.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const click = (el: HTMLElement) => act(() => el.click());
const rows = () =>
  [...container.querySelectorAll("#ledger-list tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].slice(1, 5).map((td) => td.textContent),
  );
const button = (row: number, text: string) =>
  [...container.querySelectorAll("#ledger-list tbody tr")[row].querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;

const ALICE = { id: "alice001", name: "Alice Lawyer", rate: "100" };
const BOB = { id: "bob00001", name: "Bob Partner" };

function mount(): void {
  const shell = {
    route: { program: "ledger" },
    characters: [ALICE, BOB],
    active: ALICE,
    visible: true,
  } as unknown as ProgramProps["shell"];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(LedgerProgram, { shell })));
}

beforeEach(() => {
  localStorage.clear();
  timeStore().replaceAll([]);
  timerStore().discard();
  invoiceStore().replaceAll([]);
  retainerStore().replaceAll([]);
  contactStore().replaceAll([]);
  caseStore().replaceAll([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("the Ledger page (LP-32)", () => {
  it("asks for a case first", () => {
    mount();
    expect($("#ledger-no-cases")).not.toBeNull();
    expect($("#time-new")).toBeNull();
  });

  it("logs time, filters it, edits it and deletes it", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", defendant: "Smith", lead: "alice001" });
    caseStore().save({ id: "case0002", caseNumber: "90SCCC00200", lead: "alice001" });
    mount();

    click(must("#time-new"));
    expect(must<HTMLSelectElement>("#time-character").value).toBe("alice001");
    click(must("#time-save"));
    expect(must("#time-error").textContent).toMatch(/hours/);
    setValue("#time-case", "case0001");
    setValue("#time-hours", "1.25");
    setValue("#time-activity", "drafting");
    setValue("#time-note", "Motion to dismiss");
    click(must("#time-save"));
    expect($("#time-form")).toBeNull();
    expect(rows()).toEqual([["90SCCR00147", "Alice Lawyer", "Drafting", "1.3"]]);

    click(must("#time-new"));
    setValue("#time-case", "case0002");
    setValue("#time-character", "bob00001");
    setValue("#time-hours", "2");
    click(must("#time-save"));
    expect(must("#ledger-total").textContent).toBe("3.3 hours in 2 entries, worth $130.00 (1 with no rate)");

    setValue("#ledger-character", "bob00001");
    expect(rows()).toEqual([["90SCCC00200", "Bob Partner", "Research", "2.0"]]);
    expect(must("#ledger-total").textContent).toBe("2.0 hours in 1 of 2 entries, worth $0.00 (1 with no rate)");
    setValue("#ledger-character", "");
    setValue("#ledger-case", "case0001");
    expect(rows().map((r) => r[0])).toEqual(["90SCCR00147"]);

    // The case's own rate wins over Alice's $100.
    setValue("#case-rate", "lots");
    click(must("#case-rate-save"));
    expect(must("#case-rate-error").textContent).toMatch(/dollars/);
    setValue("#case-rate", "200");
    click(must("#case-rate-save"));
    expect(caseStore().get("case0001")?.rate).toBe(200);
    expect(must("#ledger-total").textContent).toBe("1.3 hours in 1 of 2 entries, worth $260.00");

    click(button(0, "Edit"));
    expect(must<HTMLInputElement>("#time-note").value).toBe("Motion to dismiss");
    setValue("#time-hours", "0.5");
    click(must("#time-save"));
    expect(rows()[0][3]).toBe("0.5");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    click(button(0, "Delete"));
    expect(
      timeStore()
        .list()
        .map((e) => e.caseId),
    ).toEqual(["case0002"]);
  });

  it("draws the newest 100 rows, with Show more, and totals every entry (LP-222)", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    const T = "2026-10-19T16:00:00.000Z";
    timeStore().replaceAll(
      Array.from({ length: 250 }, (_, i) => ({
        id: "te" + String(i).padStart(6, "0"),
        caseId: "case0001",
        character: "bob00001",
        date: "1990-10-" + String((i % 28) + 1).padStart(2, "0"),
        hours: 1,
        activity: "research" as const,
        created: T,
        updated: T,
      })),
    );
    mount();
    const rows = () => container.querySelectorAll("#ledger-list tbody tr").length;
    expect(rows()).toBe(100);
    expect(must("#ledger-list tbody td").textContent).toContain("28 Oct 1990");
    expect(must("#ledger-total").textContent).toContain("250.0 hours in 250 entries");
    expect(must("#ledger-more").textContent).toBe("Show more (150 left)");
    click(must("#ledger-more"));
    click(must("#ledger-more"));
    expect(rows()).toBe(250);
    expect($("#ledger-more")).toBeNull();
  });

  it("times a case and logs it when stopped", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    mount();
    click(must("#timer-start"));
    expect(must("#timer-error").textContent).toMatch(/case/);
    setValue("#timer-case", "case0001");
    click(must("#timer-start"));
    expect(must("#timer-status").textContent).toBe("Timing 90SCCR00147 for Alice Lawyer: 0 min");
    click(must("#timer-stop"));
    expect($("#timer-status")).toBeNull();
    expect(timeStore().list()).toMatchObject([{ caseId: "case0001", character: "alice001", hours: 0.1 }]);
  });

  it("invoices a case's time, records a payment and deletes it (LP-33)", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    timeStore().save({ caseId: "case0001", character: "alice001", date: "1990-10-02", hours: 2, activity: "court" });
    mount();
    expect($("#invoice-new")).toBeNull();
    setValue("#ledger-case", "case0001");
    click(must("#invoice-new"));
    expect(must(".invoice-sheet").textContent).toContain("INVOICE FA-1990-0001");
    expect(must(".invoice-sheet").textContent).toContain("Balance due$200.00");

    setValue("#payment-amount", "75");
    click(must("#payment-add"));
    expect(must("#invoice-payments").textContent).toContain("$75.00");
    expect(must("#invoice-list").textContent).toContain("Part paid");
    expect(must("#receivables").textContent).toContain("$125.00");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    click(must("#invoice-delete"));
    expect(invoiceStore().list()).toEqual([]);
  });

  it("locks billed time until its invoice is deleted (LP-183)", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    timeStore().save({ caseId: "case0001", character: "alice001", date: "1990-10-02", hours: 2, activity: "court" });
    mount();
    expect(button(0, "Edit")).toBeTruthy();
    expect($("#ledger-billed-note")).toBeNull();

    click(button(0, "Edit"));
    setValue("#ledger-case", "case0001");
    click(must("#invoice-new"));
    expect($("#time-form")).toBeNull();
    expect(button(0, "Edit")).toBeUndefined();
    expect(button(0, "Delete")).toBeUndefined();
    expect(must("#ledger-list tbody tr").textContent).toContain("On FA-1990-0001");
    expect(must("#ledger-billed-note").textContent).toContain("delete that invoice");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    click(must("#invoice-delete"));
    expect(button(0, "Edit")).toBeTruthy();
    expect(button(0, "Delete")).toBeTruthy();
    expect($("#ledger-billed-note")).toBeNull();
  });

  it("warns when two invoices bill the same time, and deletes nothing (LP-186)", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    timeStore().save({ caseId: "case0001", character: "alice001", date: "1990-10-02", hours: 2, activity: "court" });
    mount();
    setValue("#ledger-case", "case0001");
    click(must("#invoice-new"));
    expect($("#invoice-shared")).toBeNull();
    expect(must("#invoice-list").textContent).not.toContain("also on");

    const [first] = invoiceStore().list();
    act(() => invoiceStore().replaceAll([first, { ...first, id: "invoice2", number: "FA-1990-0002" }]));
    expect(must("#invoice-shared").textContent).toContain("also on FA-1990-0002");
    expect(must("#invoice-list").textContent).toContain("Time also on FA-1990-0001");
    expect(must("#invoice-list").textContent).toContain("Time also on FA-1990-0002");
    expect(invoiceStore().list()).toHaveLength(2);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    click(must("#invoice-delete"));
    expect(must("#invoice-list").textContent).not.toContain("also on");
  });

  it("takes deposits and floors up to the payment limit, and says so over it (LP-188)", () => {
    contactStore().save({ name: "Judy Reyes", type: "client" });
    mount();
    click(must("#retainer-list button"));

    setValue("#deposit-amount", "150,000");
    click(must("#deposit-add"));
    expect(must("#retainer-title").textContent).toBe("Judy Reyes: $150,000.00");
    setValue("#deposit-amount", "10000001");
    click(must("#deposit-add"));
    expect(must("#retainer-error").textContent).toContain("$10,000,000.00");
    expect(retainerStore().list()).toHaveLength(1);

    setValue("#retainer-floor", "200000");
    click(must("#floor-save"));
    expect(contactStore().list()[0].retainerFloor).toBe(200000);
    setValue("#retainer-floor", "10000001");
    click(must("#floor-save"));
    expect(must("#retainer-error").textContent).toContain("$10,000,000.00");
    expect(contactStore().list()[0].retainerFloor).toBe(200000);
  });

  it("keeps a client's retainer: deposit, pay an invoice from it, warn and write the top-up letter (LP-93)", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    const judy = contactStore().save({ name: "Judy Reyes", type: "client" });
    contactStore().link(judy.id, "case0001", "client");
    timeStore().save({ caseId: "case0001", character: "alice001", date: "1990-10-02", hours: 3, activity: "court" });
    mount();

    click(must("#retainer-list button"));
    setValue("#deposit-amount", "500");
    click(must("#deposit-add"));
    expect(must("#retainer-title").textContent).toBe("Judy Reyes: $500.00");
    setValue("#retainer-floor", "250");
    click(must("#floor-save"));

    setValue("#ledger-case", "case0001");
    click(must("#invoice-new"));
    setValue("#payment-method", "retainer");
    setValue("#payment-amount", "900");
    click(must("#payment-add"));
    expect(must("#payment-status").textContent).toBe("Judy Reyes's retainer has only $500.00.");
    setValue("#payment-amount", "300");
    click(must("#payment-add"));
    expect(must("#retainer-title").textContent).toBe("Judy Reyes: $200.00");
    expect(must("#retainer-history").textContent).toContain("Invoice FA-1990-0001");

    click(must("#topup-open"));
    expect(must("#retainer .invoice-sheet").textContent).toContain("at least $50.00");
  });

  it("reports hours per character and open cases, filtered by character (LP-34)", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    timeStore().save({ caseId: "case0001", character: "alice001", date: "1990-10-02", hours: 2, activity: "court" });
    timeStore().save({ caseId: "case0001", character: "bob00001", date: "1990-10-03", hours: 1, activity: "research" });
    mount();
    expect(must("#report-hours tbody").textContent).toContain("Alice Lawyer2.0$200.00");
    expect(must("#report-cases tbody").textContent).toContain("Open1");
    setValue("#report-character", "bob00001");
    expect(must("#report-hours tbody").textContent).toBe("Bob Partner1.0$0.00");
    expect(must("#report-cases tbody").textContent).toContain("Open0");
  });
});
