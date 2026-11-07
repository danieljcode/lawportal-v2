// @vitest-environment jsdom
// Quick add (LP-221): a + on home and an open case opens a small sheet that adds a note, time or a
// next action, to the open case or else the most recently changed one, through the usual stores.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { timeStore } from "@/lib/ledger";
import type { Case } from "@/lib/types";
import { startCase } from "@/ui/QuickAddDialog";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("startCase", () => {
  const cases = [
    { id: "case0001", updated: "2026-10-01T00:00:00.000Z" },
    { id: "case0002", updated: "2026-10-05T00:00:00.000Z" },
  ] as Case[];
  it("is the open case, else the most recently changed", () => {
    expect(startCase(cases, "case0001")).toBe("case0001");
    expect(startCase(cases, null)).toBe("case0002");
    expect(startCase(cases, "gone0001")).toBe("case0002");
    expect(startCase([], null)).toBe("");
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const submit = () =>
  act(() => {
    must("#quick-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

async function openQuick(): Promise<void> {
  await act(async () => must("#quick-add").click());
  await vi.waitFor(() => must("#quick-form"));
}

describe("Quick add", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990, 12:00
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
    vi.setSystemTime(new Date("2026-10-19T16:05:00Z"));
    caseStore().save({ id: "case0002", caseNumber: "90SCCR00148", lead: "alice001" });
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

  it("from home adds a note, time and a next action to the most recent case", async () => {
    mount("#");
    await openQuick();
    expect(must<HTMLSelectElement>("#quick-case").value).toBe("case0002");

    submit();
    expect(must("#quick-error").textContent).toBe("Write the note first.");
    setValue("#quick-text", "Met the client.");
    submit();
    expect(caseStore().get("case0002")!.caseNotes).toMatchObject([{ text: "Met the client.", by: "alice001" }]);
    expect(must("#quick-done").textContent).toBe("Note added to 90SCCR00148.");
    expect(must<HTMLTextAreaElement>("#quick-text").value).toBe("");

    act(() => must<HTMLInputElement>('input[name="quick-kind"][value="time"]').click());
    setValue("#quick-case", "case0001");
    setValue("#quick-hours", "1.5");
    setValue("#quick-activity", "court");
    submit();
    expect(timeStore().list()).toMatchObject([
      { caseId: "case0001", character: "alice001", date: "1990-10-19", hours: 1.5, activity: "court" },
    ]);

    act(() => must<HTMLInputElement>('input[name="quick-kind"][value="action"]').click());
    setValue("#quick-text", "Call the DA");
    submit();
    expect(caseStore().get("case0001")!.actions).toMatchObject([{ title: "Call the DA", owner: "alice001" }]);
  });

  it("inside a case starts on that case, and isn't offered elsewhere", async () => {
    mount("#cases/case0001");
    await openQuick();
    expect(must<HTMLSelectElement>("#quick-case").value).toBe("case0001");
    act(() => root!.unmount());
    root = null;
    container!.remove();

    mount("#ledger");
    expect(document.querySelector("#quick-add")).toBeNull();
  });
});
