// @vitest-environment jsdom
// Next actions through the whole App (LP-170): adding one with an owner and a
// due date, editing it, ticking it off into the Done list and reopening it,
// removing it, overdue marking, and keeping unsaved edits to the case.
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

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function submit(sel: string): void {
  act(() => {
    must(sel).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function click(el: Element): void {
  act(() => {
    (el as HTMLElement).click();
  });
}

const actions = () => caseStore().get("case0001")!.actions || [];

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Judge", title: "Judge" });
  characterStore().save({ id: "bob00001", name: "Bob Clerk", title: "Clerk" });
  characterStore().setActive("alice001");
  caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", plaintiff: "Ann", defendant: "Bo", lead: "alice001" });
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

describe("next actions on a case (LP-170)", () => {
  it("starts empty, and asks for a title", () => {
    mount("#cases/case0001");
    expect(must("#case-actions").textContent).toContain("No actions yet.");
    submit("#action-form");
    expect(must("#action-error").textContent).toContain("Say what needs doing");
    expect(actions()).toEqual([]);
  });

  it("adds, edits, completes, reopens and removes an action, keeping unsaved edits to the case", () => {
    mount("#cases/case0001");
    setValue("#case-notes", "Not saved yet");
    setValue("#action-title", "Request disclosure");
    setValue("#action-owner", "bob00001");
    setValue("#action-due", "1990-10-18");
    submit("#action-form");
    expect(actions()).toMatchObject([{ title: "Request disclosure", owner: "bob00001", due: "1990-10-18" }]);
    expect(must<HTMLInputElement>("#action-title").value).toBe("");
    expect(must<HTMLTextAreaElement>("#case-notes").value).toBe("Not saved yet");

    const item = must("#action-list li");
    expect(item.className).toContain("overdue");
    expect(item.textContent).toContain("Bob Clerk");
    expect(item.textContent).toContain("overdue");

    click(must('[aria-label="Edit Request disclosure"]'));
    expect(document.activeElement?.id).toBe("action-edit-title");
    setValue("#action-edit-title", "Request disclosure from the DA");
    setValue("#action-edit-owner", "");
    submit("#action-edit-form");
    expect(actions()).toMatchObject([{ title: "Request disclosure from the DA", due: "1990-10-18" }]);
    expect(actions()[0]).not.toHaveProperty("owner");
    expect(must("#action-list li").textContent).toContain("Unassigned");

    click(must('[aria-label="Done: Request disclosure from the DA"]'));
    expect(actions()[0].done).toBe(true);
    expect(document.querySelector("#action-list")).toBeNull();
    expect(must("#case-actions").textContent).toContain("Nothing left to do.");
    expect(must("#action-done summary").textContent).toBe("Done (1)");
    expect(must("#action-done li").className).not.toContain("overdue");

    click(must('[aria-label="Reopen: Request disclosure from the DA"]'));
    expect(actions()[0]).not.toHaveProperty("done");
    expect(document.querySelector("#action-done")).toBeNull();

    click(must('[aria-label="Remove Request disclosure from the DA"]'));
    expect(actions()).toEqual([]);
    expect(must<HTMLTextAreaElement>("#case-notes").value).toBe("Not saved yet");
  });

  it("cancelling an edit changes nothing", () => {
    caseStore().save({ ...caseStore().get("case0001")!, actions: [{ id: "act00001", title: "Call the client" }] });
    mount("#cases/case0001");
    click(must('[aria-label="Edit Call the client"]'));
    setValue("#action-edit-title", "Changed");
    click([...document.querySelectorAll("#action-edit-form button")].find((b) => b.textContent === "Cancel")!);
    expect(actions()).toEqual([{ id: "act00001", title: "Call the client" }]);
    expect(document.querySelector("#action-edit-form")).toBeNull();
  });
});
