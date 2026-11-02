// @vitest-environment jsdom
// Outcomes and the Firm Record through the whole App (LP-92): closing a case asks
// how it ended, an already closed case can have one added, and the record adds
// them up, filters, and copies.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import * as clipboard from "@/lib/clipboard";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

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

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function save(): void {
  act(() => {
    must("#case-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().setActive("alice001");
  caseStore().save({
    id: "case0001",
    caseNumber: "90SCCR00147",
    plaintiff: "People",
    defendant: "Lee",
    lead: "alice001",
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("case outcomes (LP-92)", () => {
  it("asks how it ended when a case is set to Closed, and saves the answer", async () => {
    await mount("#cases/case0001");
    expect(document.querySelector("#case-outcome")).toBeNull();
    setValue("#case-status", "Closed");
    expect(must("#case-outcome legend").textContent).toBe("How did it end?");
    setValue("#case-result", "plea");
    setValue("#case-result-note", "Reduced to a misdemeanour");
    save();
    expect(caseStore().get("case0001")!.outcome).toEqual({
      result: "plea",
      date: "1990-10-19",
      note: "Reduced to a misdemeanour",
    });
  });

  it("lets a closed case go without one, list it, and have one added afterwards", async () => {
    caseStore().save({ ...caseStore().get("case0001")!, status: "Closed" });
    await mount("#cases/record");
    expect(must("#record-empty")).toBeTruthy();
    expect(must<HTMLAnchorElement>("#record-unrecorded a").getAttribute("href")).toBe("#cases/case0001");
    act(() => {
      history.pushState(null, "", "#cases/case0001");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    setValue("#case-result", "won");
    save();
    expect(caseStore().get("case0001")!.outcome?.result).toBe("won");
  });

  it("a reopened case keeps its outcome, and doesn't count until it closes again", async () => {
    caseStore().save({
      ...caseStore().get("case0001")!,
      status: "Closed",
      outcome: { result: "won", date: "1990-10-01" },
    });
    await mount("#cases/case0001");
    setValue("#case-status", "Open");
    save();
    expect(caseStore().get("case0001")!.outcome?.result).toBe("won");
    act(() => {
      history.pushState(null, "", "#cases/record");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(must("#record-empty")).toBeTruthy();
  });
});

describe("the Firm Record (LP-92)", () => {
  beforeEach(() => {
    caseStore().save({
      ...caseStore().get("case0001")!,
      status: "Closed",
      outcome: { result: "won", date: "1990-10-01", note: "Jury verdict" },
    });
    caseStore().save({
      id: "case0002",
      caseNumber: "90SCCC00200",
      status: "Closed",
      lead: "alice001",
      outcome: { result: "lost", date: "1990-10-05" },
    });
  });

  it("shows totals and the win rate, and each lawyer's cases linked to the Case File", async () => {
    await mount("#cases/record");
    expect(must("#case-nav-record").getAttribute("aria-current")).toBe("page");
    const rows = [...document.querySelectorAll("#record-table tbody tr")];
    expect(rows.map((r) => r.querySelector("th")!.textContent)).toEqual(["The firm", "Alice Lawyer"]);
    expect(rows[0].textContent).toContain("50%");
    const list = must('[aria-label="Alice Lawyer\'s cases"]');
    expect(list.querySelector("a")!.getAttribute("href")).toBe("#cases/case0002");
    expect(list.textContent).toContain("Jury verdict");
  });

  it("filters by matter type and dates", async () => {
    await mount("#cases/record");
    setValue("#record-matter", "Civil");
    expect(must("#record-table tbody tr td").textContent).toBe("1");
    expect(must("#record-table").textContent).toContain("0%");
    setValue("#record-from", "1990-10-06");
    expect(must("#record-empty")).toBeTruthy();
  });

  it("copies a summary, and prints only while the dialog is open", async () => {
    const copy = vi.spyOn(clipboard, "copyText").mockResolvedValue(true);
    const print = vi.fn(() => expect(document.querySelector("#record-print-sheet")).toBeTruthy());
    vi.stubGlobal("print", print);
    window.print = print;
    await mount("#cases/record");
    await act(async () => {
      must<HTMLButtonElement>("#record-copy").click();
      await Promise.resolve();
    });
    expect(copy.mock.calls[0][0]).toContain("The firm: 2 cases, 1 won, 1 lost, win rate 50%");
    expect(must("#record-status").textContent).toBe("Copied.");
    act(() => must<HTMLButtonElement>("#record-print").click());
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector("#record-print-sheet")).toBeNull();
  });
});
