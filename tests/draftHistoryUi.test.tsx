// @vitest-environment jsdom
// Draft history through the whole App (LP-89): Undo/Redo buttons and keys with
// typing grouped, a snapshot every few minutes and before Clear form, and the
// Draft history dialog's list, preview and Restore.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { draftHistory, SNAPSHOT_EVERY_MS } from "@/lib/draftHistory";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORM = "civil-complaint";
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let clock = Date.UTC(2026, 9, 19, 12, 0);

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function mount(): void {
  history.replaceState(null, "", "#" + FORM);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function click(sel: string): void {
  act(() => must(sel).click());
}

/** Type `text` one letter at a time, `gap` ms apart. */
function typeSlowly(sel: string, text: string, gap = 100): void {
  const input = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  for (let i = 1; i <= text.length; i++) {
    clock += gap;
    vi.setSystemTime(clock);
    act(() => {
      setter.call(input, text.slice(0, i));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

function key(k: string, opts: KeyboardEventInit = {}): void {
  act(() => {
    must("#f-plaintiff-name").dispatchEvent(
      new KeyboardEvent("keydown", { key: k, ctrlKey: true, bubbles: true, ...opts }),
    );
  });
}

const value = (sel: string) => must<HTMLInputElement>(sel).value;

beforeEach(() => {
  localStorage.clear();
  clock = Date.UTC(2026, 9, 19, 12, 0);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
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

describe("undo and redo (LP-89)", () => {
  it("Undo takes back a whole word typed in one go, and Redo puts it back", () => {
    mount();
    expect(must<HTMLButtonElement>("#undo").disabled).toBe(true);
    typeSlowly("#f-plaintiff-name", "Ann");
    typeSlowly("#f-defendant-name", "Bo");
    expect(must<HTMLButtonElement>("#undo").disabled).toBe(false);
    click("#undo");
    expect(value("#f-defendant-name")).toBe("");
    expect(value("#f-plaintiff-name")).toBe("Ann");
    click("#undo");
    expect(value("#f-plaintiff-name")).toBe("");
    expect(must<HTMLButtonElement>("#undo").disabled).toBe(true);
    click("#redo");
    expect(value("#f-plaintiff-name")).toBe("Ann");
  });

  it("a pause while typing starts a new step", () => {
    mount();
    typeSlowly("#f-plaintiff-name", "Ann");
    clock += 5000;
    typeSlowly("#f-plaintiff-name", "Ann Lee".slice(0, 7));
    click("#undo");
    expect(value("#f-plaintiff-name")).toBe("Ann");
  });

  it("Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work from inside the form", () => {
    mount();
    typeSlowly("#f-plaintiff-name", "Ann");
    key("z");
    expect(value("#f-plaintiff-name")).toBe("");
    key("y");
    expect(value("#f-plaintiff-name")).toBe("Ann");
    key("z");
    key("Z", { shiftKey: true });
    expect(value("#f-plaintiff-name")).toBe("Ann");
  });

  it("Clear form can be undone", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    typeSlowly("#f-plaintiff-name", "Ann");
    click("#reset-form");
    expect(value("#f-plaintiff-name")).toBe("");
    click("#undo");
    expect(value("#f-plaintiff-name")).toBe("Ann");
  });
});

describe("draft history (LP-89)", () => {
  it("keeps a snapshot once a few minutes have passed while editing", () => {
    mount();
    typeSlowly("#f-plaintiff-name", "Ann");
    expect(draftHistory().list(FORM)).toHaveLength(1); // the session's first edit keeps one straight away
    typeSlowly("#f-defendant-name", "Bo");
    expect(draftHistory().list(FORM)).toHaveLength(1);
    clock += SNAPSHOT_EVERY_MS;
    typeSlowly("#f-defendant-name", "Bo Day".slice(0, 6), 10);
    const list = draftHistory().list(FORM);
    expect(list).toHaveLength(2);
    // Taken at the first change after the gap: the field had just been retyped to "B".
    expect(list[0].state.values["Defendant name"]).toBe("B");
    expect(list[0].state.values["Plaintiff name"]).toBe("Ann");
  });

  it("keeps one before Clear form, and the dialog restores it after asking", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    typeSlowly("#f-plaintiff-name", "Ann Lee");
    click("#reset-form");
    expect(value("#f-plaintiff-name")).toBe("");

    click("#open-history");
    expect(must("#history-dialog").hasAttribute("open")).toBe(true);
    const items = document.querySelectorAll("#history-list .history-item");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].textContent).toContain("1990");
    expect(must("#history-preview").textContent).toContain("Ann Lee");

    click("#history-restore");
    expect(confirmSpy.mock.calls.at(-1)![0]).toContain("Replace your current draft");
    expect(must("#history-dialog").hasAttribute("open")).toBe(false);
    expect(value("#f-plaintiff-name")).toBe("Ann Lee");
    expect(must("#docket-status").textContent).toContain("Restored the version from");
    // Undo puts the cleared draft back.
    click("#undo");
    expect(value("#f-plaintiff-name")).toBe("");
  });

  it("says so when there's nothing yet", () => {
    mount();
    click("#open-history");
    expect(must("#history-empty").textContent).toContain("No earlier versions");
  });
});
