// @vitest-environment jsdom
// Next-action checklists (LP-230): cleaned, the starter lists until the firm edits its own, added to a
// case without repeating actions it already has, edited in Settings, and synced with the other lists.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import {
  checklistFor,
  checklistsOrStarter,
  checklistStore,
  cleanChecklist,
  STARTER_CHECKLISTS,
  withChecklist,
} from "@/lib/checklists";
import { resolve } from "@/lib/sync";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("checklists", () => {
  beforeEach(() => {
    localStorage.clear();
    checklistStore().reset();
  });

  it("are cleaned: a name is needed, blank and repeated items go", () => {
    expect(cleanChecklist({ items: ["a"] })).toBeNull();
    expect(
      cleanChecklist(
        { id: "chk00001", name: " Mine ", items: ["Call", " ", "call", 3, "File"] },
        "2026-11-07T00:00:00Z",
      ),
    ).toEqual({
      id: "chk00001",
      name: "Mine",
      matter: "Other",
      items: ["Call", "File"],
      updated: "2026-11-07T00:00:00Z",
    });
  });

  it("start as the starter lists, and the first edit keeps the rest", () => {
    expect(checklistsOrStarter(checklistStore().list())).toBe(STARTER_CHECKLISTS);
    expect(checklistFor(STARTER_CHECKLISTS, "Civil")!.name).toBe("Civil plaintiff");
    expect(checklistFor(STARTER_CHECKLISTS, "Nothing")!.name).toBe("Criminal defence");

    checklistStore().save({ ...STARTER_CHECKLISTS[1], items: ["Only this"] });
    const own = checklistStore().list();
    expect(own.map((l) => l.id)).toEqual(STARTER_CHECKLISTS.map((l) => l.id));
    expect(own[1].items).toEqual(["Only this"]);
    expect(() => checklistStore().save({ name: " " })).toThrow("Give the checklist a name");

    checklistStore().reset();
    expect(checklistStore().list()).toEqual([]);
  });

  it("add only the actions a case doesn't have yet", () => {
    const r = withChecklist([{ id: "act00001", title: "meet the client", done: true }], {
      items: ["Meet the client", "File the answer"],
    });
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.actions[1]).toMatchObject({ title: "File the answer" });
    expect(r.actions[1]).not.toHaveProperty("owner");
    expect(r.actions[1]).not.toHaveProperty("due");
  });

  it("sync: another device's lists are taken", () => {
    const theirs = { ...STARTER_CHECKLISTS[0], items: ["From the other device"], updated: "2026-11-08T00:00:00.000Z" };
    const { doc } = resolve({ characters: [], cases: [], checklists: [theirs] }, null);
    expect(doc.checklists).toMatchObject([{ id: "chkcrimdef", items: ["From the other device"] }]);
  });
});

/* ---------- in the app ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

const titles = () => (caseStore().get("case0001")!.actions || []).map((a) => a.title);

describe("checklists in the app", () => {
  beforeEach(() => {
    localStorage.clear();
    checklistStore().reset();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
    caseStore().save({
      id: "case0001",
      caseNumber: "90SCCC00147",
      lead: "alice001",
      actions: [{ id: "act00001", title: "Meet the client" }],
    });
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("Add checklist on a civil case picks the civil list and skips what's there", () => {
    mount("#cases/case0001");
    expect(must<HTMLSelectElement>("#checklist-pick").value).toBe("chkcivplt");
    act(() => must("#checklist-add").click());
    expect(titles()).toEqual(["Meet the client", ...STARTER_CHECKLISTS[2].items.slice(1)]);
    expect(must("#checklist-status").textContent).toBe("Added 5 actions; 1 already on the case or no room.");
    act(() => must("#checklist-add").click());
    expect(must("#checklist-status").textContent).toContain("Nothing added");
  });

  it("Settings edits a list: add, reorder and remove items", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("#control");
    setValue(must<HTMLSelectElement>("#checklists-pick"), "chksmall");
    setValue(must<HTMLInputElement>("#checklists-item"), "Send a reminder");
    act(() => must("#checklists-add").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const small = () =>
      checklistStore()
        .list()
        .find((l) => l.id === "chksmall")!.items;
    expect(small().at(-1)).toBe("Send a reminder");
    act(() => must('[aria-label="Move up: Send a reminder"]').click());
    expect(small().at(-2)).toBe("Send a reminder");
    act(() => must('[aria-label="Remove: Meet the client"]').click());
    expect(small()).not.toContain("Meet the client");

    setValue(must<HTMLInputElement>("#checklists-name"), "");
    expect(must("#checklists-error").textContent).toContain("Give the checklist a name");
    setValue(must<HTMLInputElement>("#checklists-name"), "Small claims plaintiff");
    expect(
      checklistStore()
        .list()
        .find((l) => l.id === "chksmall")!.name,
    ).toBe("Small claims plaintiff");

    act(() => must("#checklists-reset").click());
    expect(checklistStore().list()).toEqual([]);
  });
});
