// @vitest-environment jsdom
// The Court Docket through the whole App (LP-91): only for a judge, filtering, and a judge template opened with the case's details.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
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

function select(sel: string, value: string): void {
  const el = must<HTMLSelectElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
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
  characterStore().save({ id: "judge001", name: "Judy Bench", title: "Judge" });
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().setActive("judge001");
  caseStore().save({
    id: "case0001",
    caseNumber: "90SCCR00147",
    plaintiff: "People",
    defendant: "Lee",
    court: "Superior Court",
    status: "Awaiting judgement",
    lead: "judge001",
  });
  caseStore().save({ id: "case0002", caseNumber: "90SCCR00200", lead: "judge001", nextDate: "1990-10-21" });
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

describe("the Court Docket (LP-91)", () => {
  it("lists a judge's cases with standing and next date, and filters them", async () => {
    await mount("#cases/docket");
    expect(must("#case-nav-docket").getAttribute("aria-current")).toBe("page");
    const items = [...document.querySelectorAll("#court-docket-list li")];
    expect(items[0].textContent).toContain("90SCCR00200");
    expect(items[0].textContent).toContain("Wed 21 Oct 1990");
    expect(items[0].textContent).toContain("Scheduled");
    expect(items[1].textContent).toContain("People v. Lee");
    expect(items[1].textContent).toContain("Under advisement: awaiting your ruling");
    select("#court-docket-filter", "Closed");
    expect(must("#court-docket-empty").textContent).toBe("No cases are closed.");
  });

  it("a lawyer has no link to it, and the address shows All cases", async () => {
    characterStore().setActive("alice001");
    await mount("#cases/docket");
    expect(document.querySelector("#case-nav-docket")).toBeNull();
    expect(document.querySelector("#court-docket")).toBeNull();
    expect(must("#case-file-title").textContent).toBe("Case File");
  });

  it("starts a judge template with the case's details, once", async () => {
    await mount("#cases/docket");
    select('[aria-label="Template for 90SCCR00147"]', "extra-ruling-on-motion");
    await act(async () => {
      must<HTMLButtonElement>('[aria-label="Start for 90SCCR00147"]').click();
      await vi.dynamicImportSettled();
    });
    expect(location.hash).toBe("#filings/extra-ruling-on-motion");
    expect(must<HTMLInputElement>("#f-case-number").value).toBe("90SCCR00147");
    expect(must<HTMLInputElement>("#f-plaintiff-name").value).toBe("People");
    expect(must<HTMLInputElement>("#f-defendant-name").value).toBe("Lee");
  });
});
