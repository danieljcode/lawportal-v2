// @vitest-environment jsdom
// The jump box (LP-128): Ctrl+K, Cmd+K or "/" (not while typing) opens it from
// anywhere, in both layouts; it finds programs, sections and forms; the arrow
// keys and Enter pick one; closing it puts the focus back; and it's a combobox
// over a listbox for a screen reader.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { characterStore } from "@/lib/characters";
import { setShell } from "@/lib/shell";
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
  history.replaceState(null, "", hash || location.pathname);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

function type(text: string): void {
  const input = must<HTMLInputElement>("#jump-input");
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const isOpen = () => !!document.querySelector("#jump-box[open]");
const results = () => [...document.querySelectorAll("#jump-results [role=option]")];
const names = () => results().map((o) => o.querySelector(".jump-name")!.textContent);
const current = () => document.querySelector("#jump-results [aria-selected=true] .jump-name")?.textContent;

describe("the jump box (LP-128)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
    characterStore().save({ id: "carl0001", name: "Carl Commissioner", title: "Court Commissioner" });
    characterStore().setActive("alice001");
  });

  afterEach(() => {
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens with Ctrl+K or Cmd+K from anywhere, even a field, and takes the focus", () => {
    mount("#cases");
    expect(isOpen()).toBe(false);
    const e = press("k", { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(must("#jump-input"));
    act(() => must("#jump-box [data-close]").click());
    expect(isOpen()).toBe(false);

    const select = must<HTMLSelectElement>("#active-character");
    select.focus();
    press("K", { metaKey: true }, select);
    expect(isOpen()).toBe(true);
  });

  it("doesn't open with Ctrl+K over another dialog, so what's typed there stays (LP-131)", () => {
    mount("#cases");
    act(() => must("#menu-file").click());
    act(() => must("#menu-characters").click());
    act(() => must("#new-character").click());
    const name = must<HTMLInputElement>("#char-name");
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(name, "Half typed");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    name.focus();
    const e = press("k", { ctrlKey: true }, name);
    expect(e.defaultPrevented).toBe(false);
    expect(isOpen()).toBe(false);
    expect(must("#characters-dialog").hasAttribute("open")).toBe(true);
    expect(must<HTMLInputElement>("#char-name").value).toBe("Half typed");
  });

  it('opens with "/" but not while typing in a field', () => {
    mount("#clients/intake");
    const field = document.createElement("input");
    must("#editor").appendChild(field);
    field.focus();
    const typed = press("/", {}, field);
    expect(typed.defaultPrevented).toBe(false);
    expect(isOpen()).toBe(false);

    const box = document.createElement("input");
    box.type = "checkbox";
    must("#editor").appendChild(box);
    box.focus();
    press("/", {}, box);
    expect(isOpen()).toBe(true);
  });

  it("lists the programs and sections the character can see before anything is typed", () => {
    mount("");
    press("k", { ctrlKey: true });
    expect(names()).toEqual([
      "Court Filings",
      "Case File",
      "Clients",
      "Law Library",
      "Settings",
      "All cases",
      "Upcoming",
      "New client intake",
      "Conflict check",
      "Penal Code",
      "Precedents",
    ]);
    expect(current()).toBe("Court Filings");
  });

  it("finds the J.A.P. only for a Court Commissioner", () => {
    mount("");
    press("k", { ctrlKey: true });
    type("jap");
    expect(names()).toEqual([]);
    expect(must("#jump-empty").textContent).toContain("jap");
    expect(must("#jump-count").textContent).toBe("No results");
    act(() => must("#jump-box [data-close]").click());

    act(() => characterStore().setActive("carl0001"));
    press("k", { ctrlKey: true });
    type("jap");
    expect(names()).toEqual(["J.A.P."]);
  });

  it("finds court forms by name and opens the picked one with the arrow keys and Enter", () => {
    mount("");
    press("k", { ctrlKey: true });
    type("complaint");
    expect(names()[0]).toBe("Civil Complaint");
    expect(must("#jump-count").textContent).toMatch(/^\d+ results?$/);
    const input = must("#jump-input");
    press("ArrowDown", {}, input);
    press("ArrowUp", {}, input);
    expect(current()).toBe("Civil Complaint");
    press("Enter", {}, input);
    expect(isOpen()).toBe(false);
    expect(location.hash).toBe("#filings/civil-complaint");
    expect(must("#m-title").textContent).toBe("Civil Complaint");
  });

  it("wraps round with the arrow keys and goes to a section", () => {
    mount("#filings");
    press("k", { ctrlKey: true });
    type("upcoming");
    expect(names()).toEqual(["Upcoming"]);
    const input = must("#jump-input");
    press("ArrowDown", {}, input);
    expect(current()).toBe("Upcoming");
    press("Enter", {}, input);
    expect(location.hash).toBe("#cases/upcoming");
  });

  it("takes a program back to where it was left, and a click picks too", () => {
    mount("#cases/upcoming");
    act(() => {
      history.pushState(null, "", "#control");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    press("k", { ctrlKey: true });
    type("case file");
    act(() => (results()[0] as HTMLElement).click());
    expect(location.hash).toBe("#cases/upcoming");
  });

  it("puts the focus back where it was when closed", () => {
    mount("#cases");
    const all = must<HTMLAnchorElement>("#case-nav-all");
    all.focus();
    press("/", {}, all);
    expect(document.activeElement).toBe(must("#jump-input"));
    act(() => must("#jump-box [data-close]").click());
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(all);
  });

  it("is a combobox over a listbox, with the highlighted option active", () => {
    mount("");
    press("k", { ctrlKey: true });
    const input = must("#jump-input");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-controls")).toBe("jump-results");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(must("label[for=jump-input]").textContent).toBe("Find a program, section or form");
    expect(must("#jump-results").getAttribute("role")).toBe("listbox");
    press("ArrowDown", {}, input);
    const active = input.getAttribute("aria-activedescendant")!;
    expect(must("#" + active).getAttribute("aria-selected")).toBe("true");
    expect(must("#" + active).textContent).toContain("Case File");
    expect(must("#" + active).textContent).toContain("Program");
  });

  it("works in the Classic layout, and the View menu opens it too", () => {
    setShell("classic");
    mount("#cases");
    expect(must(".app-window")).toBeTruthy();
    press("k", { ctrlKey: true });
    expect(isOpen()).toBe(true);
    act(() => must("#jump-box [data-close]").click());

    act(() => must("#menu-view").click());
    act(() => must("#menu-jump").click());
    expect(isOpen()).toBe(true);
    type("precedents");
    press("Enter", {}, must("#jump-input"));
    expect(location.hash).toBe("#library/precedents");
  });
});
