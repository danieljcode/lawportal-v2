// @vitest-environment jsdom
// Settings (LP-109; the Control Panel in Classic): Characters, Sync, Appearance,
// What's new and About on one page; the top bar keeps only the active character,
// sync status and Dockets; Classic has no global toolbar; the dialogs other
// programs open still work.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { BOOTED_KEY } from "@/lib/boot";
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

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = (sel: string) => act(() => must(sel).click());
const sections = () => [...document.querySelectorAll(".settings-section > h3")].map((h) => h.textContent);
const GONE = ["#open-characters", "#open-changelog", "#open-about", "#theme-toggle", ".toolbar"];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.setItem(BOOTED_KEY, "1"); // no startup screen over Classic
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().setActive("alice001");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Settings (LP-109)", () => {
  it("has Characters, Sync, Appearance, What's new and About, and the top bar only the program's things", () => {
    mount("#control");
    expect(must("#m-title").textContent).toBe("Settings");
    expect(must("#control-title").textContent).toBe("Settings");
    expect(sections()).toEqual(["Characters", "Sync", "Appearance", "What's new", "About Court Filing System"]);
    expect(must("#settings-characters #char-list").textContent).toContain("Alice Lawyer");
    expect(must("#settings-sync #sync-badge").textContent).toBe("Off");
    // Sync has its own section, so the Characters section doesn't repeat it.
    expect(document.querySelector("#settings-characters #sync-badge")).toBeNull();
    expect(must("#settings-changelog #changelog-list")).toBeTruthy();
    expect(must("#settings-about #about-licence").textContent).toContain("Friedman & Associates");
    for (const sel of GONE) expect(document.querySelector(sel), sel).toBeNull();
    expect(must(".m-topbar #active-character")).toBeTruthy();
  });

  it("adds a character on the page, and the top bar can switch to it", () => {
    mount("#control");
    click("#new-character");
    setValue("#char-name", "Bo Barrister");
    act(() => must("#char-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(must("#char-list").textContent).toContain("Bo Barrister");
    const options = [...must<HTMLSelectElement>(".m-topbar #active-character").options].map((o) => o.text);
    expect(options).toContain("Bo Barrister");
  });

  it("reads What's new by being opened: the unread dot on its rail item goes", () => {
    mount("#cases");
    expect(must("#rail-control #changelog-dot")).toBeTruthy();
    go("#control");
    expect(document.querySelector("#changelog-dot")).toBeNull();
  });

  it("keeps the menus on the page in Settings, and the Characters dialog for other programs", () => {
    mount("#control");
    click("#menu-file");
    click("#menu-characters");
    expect(must<HTMLDialogElement>("#characters-dialog").open).toBe(false);
    expect(document.querySelectorAll("#char-list")).toHaveLength(1);
    go("#clients/intake");
    // Settings' sections leave the page while it's hidden, so the dialog's ids are its own.
    expect(document.querySelector("#settings-characters")).toBeNull();
    click("#menu-file");
    click("#menu-characters");
    expect(must<HTMLDialogElement>("#characters-dialog").open).toBe(true);
    expect(document.querySelectorAll("#char-list")).toHaveLength(1);
  });

  it("links the sync status to Settings", () => {
    vi.spyOn(sync, "code").mockReturnValue("ABCD-EFGH-IJKL");
    mount("#cases");
    expect(must(".m-topbar #sync-status").getAttribute("href")).toBe("#control");
  });
});

describe("Settings in the Classic layout (LP-109)", () => {
  beforeEach(() => setShell("classic"));

  it("is the Control Panel, with no global toolbar; sync status is in the taskbar tray", () => {
    vi.spyOn(sync, "code").mockReturnValue("ABCD-EFGH-IJKL");
    mount("#control");
    expect(must(".app-title .title-bar-text").textContent).toBe("Control Panel - Friedman & Associates");
    expect(must("#control-title").textContent).toBe("Control Panel");
    for (const sel of GONE) expect(document.querySelector(sel), sel).toBeNull();
    expect(must(".taskbar .tray #sync-status").getAttribute("aria-label")).toMatch(/^Sync: /);
    expect(must(".taskbar #active-character")).toBeTruthy();
  });

  it("keeps ☰ for a program's navigation pane, beside the menu bar", () => {
    mount("#cases");
    expect(must(".classic-bar #toggle-nav").getAttribute("aria-controls")).toBe("case-nav");
    click("#toggle-nav");
    expect(must(".app-window").className).toContain("nav-open");
  });
});
