// @vitest-environment jsdom
// The Ledger page (LP-32): log time against a case, filter it, edit it and delete it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { caseStore } from "@/lib/cases";
import { timeStore } from "@/lib/ledger";
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
  const shell = { characters: [ALICE, BOB], active: ALICE, visible: true } as unknown as ProgramProps["shell"];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(LedgerProgram, { shell })));
}

beforeEach(() => {
  localStorage.clear();
  timeStore().replaceAll([]);
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
});
