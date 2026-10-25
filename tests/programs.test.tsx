// @vitest-environment jsdom
// The program shell (LP-103): routes prefixed by program, the old hashes
// redirected, the registry, and through the App: each program in its own
// window with its title bar and File / View / Help menus, the Program Manager (LP-104), and
// the active character in the taskbar in every program.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { PROGRAMS, programFor } from "@/shell/registry";
import { hashFor, parseHash, type Route } from "@/shell/useRoute";
import { markBooted } from "@/lib/boot";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { LAST_FORM_KEY } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import { setShell } from "@/lib/shell";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("routes", () => {
  it("have one hash each, prefixed by program, that reads back as the same route", () => {
    const routes: Route[] = [
      { program: "home" },
      { program: "filings", formId: null },
      { program: "filings", formId: "civil-complaint" },
      { program: "cases", caseId: null },
      { program: "cases", caseId: "case0001" },
      { program: "cases", caseId: null, upcoming: true },
      { program: "clients", page: "intake" },
      { program: "clients", page: "conflicts" },
      { program: "library", page: "penal-code" },
      { program: "library", page: "precedents" },
      { program: "jap" },
      { program: "control" },
    ];
    expect(routes.map(hashFor)).toEqual([
      "",
      "#filings",
      "#filings/civil-complaint",
      "#cases",
      "#cases/case0001",
      "#cases/upcoming",
      "#clients/intake",
      "#clients/conflicts",
      "#library/penal-code",
      "#library/precedents",
      "#jap",
      "#control",
    ]);
    for (const r of routes) expect(parseHash(hashFor(r)), hashFor(r)).toEqual(r);
  });

  it("read every old hash as its new place", () => {
    const moved: Array<[string, string]> = [
      ["#cases", "#cases"],
      ["#cases/case0001", "#cases/case0001"],
      ["#upcoming", "#cases/upcoming"],
      ["#intake", "#clients/intake"],
      ["#conflicts", "#clients/conflicts"],
      ["#library", "#library/penal-code"],
      ["#jap", "#jap"],
      ["#civil-complaint", "#filings/civil-complaint"],
      // The last place saved before LP-103 had no "#".
      ["upcoming", "#cases/upcoming"],
      ["extra-general-motion", "#filings/extra-general-motion"],
    ];
    for (const [old, now] of moved) expect(hashFor(parseHash(old)), old).toBe(now);
  });

  it("open a program at its start for an unknown page, and home for anything else", () => {
    expect(hashFor(parseHash("#filings/not-a-form"))).toBe("#filings");
    expect(hashFor(parseHash("#cases/NOT AN ID"))).toBe("#cases");
    expect(hashFor(parseHash("#clients/nope"))).toBe("#clients/intake");
    expect(hashFor(parseHash("#library/nope"))).toBe("#library/penal-code");
    expect(parseHash("#nonsense")).toEqual({ program: "home" });
    expect(parseHash("#%E0%A4%A")).toEqual({ program: "home" });
  });
});

describe("the program registry", () => {
  it("has each program once, opening at its own start", () => {
    expect(PROGRAMS.map((p) => p.title)).toEqual([
      "Court Filings",
      "Case File",
      "Clients",
      "Law Library",
      "J.A.P.",
      "Control Panel",
    ]);
    for (const p of PROGRAMS) expect(programFor(parseHash(p.start))?.id, p.id).toBe(p.id);
    expect(programFor({ program: "home" })).toBeNull();
    expect(PROGRAMS.filter((p) => p.group === "main").map((p) => p.id)).toEqual(["control"]);
  });

  it("shows the J.A.P. only to Court Commissioners", () => {
    const jap = PROGRAMS.find((p) => p.id === "jap")!;
    expect(jap.visible({ commissioner: false })).toBe(false);
    expect(jap.visible({ commissioner: true })).toBe(true);
  });
});

/* ---------- through the App ---------- */

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

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const title = () => must(".app-title .title-bar-text").textContent;
const click = (sel: string) => act(() => must(sel).click());

describe("the program shell (LP-103)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
    // LP-103 and LP-104 built these in the Classic layout (LP-125).
    setShell("classic");
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().save({ id: "carl0001", name: "Carl Commissioner", title: "Court Commissioner" });
    characterStore().setActive("alice001");
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
  });

  afterEach(() => {
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens each program full-screen in its own window, and rewrites an old link", () => {
    mount("#extra-general-motion");
    expect(location.hash).toBe("#filings/extra-general-motion");
    expect(title()).toBe("Court Filings - Friedman & Associates");
    expect(document.querySelector("#sidebar")).not.toBeNull();
    expect(must("#f-grounds")).toBeTruthy();

    go("#upcoming");
    expect(location.hash).toBe("#cases/upcoming");
    expect(title()).toBe("Case File - Friedman & Associates");
    expect(document.title).toBe("Upcoming · Friedman & Associates: Court Filing System");
    // One program at a time: the forms list belongs to Court Filings.
    expect(document.querySelector("#sidebar")!.closest('[style*="display: none"]')).not.toBeNull();

    go("#library/precedents");
    expect(title()).toBe("Law Library - Friedman & Associates");
    expect(must('#library-nav [aria-current="page"]').textContent).toBe("Precedents");

    go("#control");
    expect(title()).toBe("Control Panel - Friedman & Associates");
    expect(must("#control-theme")).toBeTruthy();
  });

  it("reopens the last place on boot, saved before or after LP-103", () => {
    defaultKV().set(LAST_FORM_KEY, "upcoming");
    mount("");
    expect(location.hash).toBe("#cases/upcoming");
    unmount();
    history.replaceState(null, "", location.pathname);
    mount("");
    expect(location.hash).toBe("#cases/upcoming");
    expect(defaultKV().get(LAST_FORM_KEY)).toBe("cases/upcoming");
  });

  it("gives every program File, View and Help menus", () => {
    mount("#cases");
    expect([...document.querySelectorAll(".menu-top")].map((b) => b.textContent)).toEqual(["File", "View", "Help"]);
    click("#menu-help");
    expect(must("#menu-help").getAttribute("aria-expanded")).toBe("true");
    click("#menu-about");
    expect(must<HTMLDialogElement>("#about-dialog").open).toBe(true);
    expect(document.querySelector(".menu-list")).toBeNull();

    // View → theme, the same choice as the toolbar's button.
    click("#menu-view");
    click("#menu-theme-dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(must("#theme-toggle").getAttribute("aria-label")).toContain("dark");

    // File → Exit: back to the start page.
    click("#menu-file");
    click("#menu-exit");
    expect(location.hash).toBe("");
    expect(must("#program-manager")).toBeTruthy();
  });

  it("closes a menu with Esc and moves through its items with the arrow keys", () => {
    mount("#cases");
    click("#menu-file");
    const items = [...document.querySelectorAll<HTMLElement>(".menu-list [role^='menuitem']")];
    expect(document.activeElement).toBe(items[0]);
    const key = (k: string) =>
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    key("ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    key("ArrowRight");
    expect(must("#menu-view").getAttribute("aria-expanded")).toBe("true");
    key("Escape");
    expect(document.querySelector(".menu-list")).toBeNull();
    expect(document.activeElement).toBe(must("#menu-view"));
  });

  it("opens on the Program Manager, and Start returns to it", () => {
    mount("#cases");
    expect(must("#task-btn").textContent).toBe("🗀Case File");
    click("#start-btn");
    expect(location.hash).toBe("");
    expect(title()).toBe("Program Manager - Friedman & Associates");
    expect(must("#task-btn").textContent).toBe("▦Program Manager");
    expect(must("#program-manager")).toBeTruthy();
  });

  it("shows the active character in every program, in the taskbar", () => {
    for (const hash of ["#filings", "#cases", "#clients/intake", "#library/penal-code", "#control"]) {
      mount(hash);
      const picker = must<HTMLSelectElement>(".taskbar #active-character");
      expect(picker.value, hash).toBe("alice001");
      unmount();
    }
    mount("#library/penal-code");
    const picker = must<HTMLSelectElement>(".taskbar #active-character");
    act(() => {
      picker.value = "carl0001";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(characterStore().activeId()).toBe("carl0001");
  });

  it("has each program's navigation pane as a drawer at phone width, and no ☰ without one", () => {
    mount("#filings");
    expect(must("#toggle-nav").getAttribute("aria-controls")).toBe("sidebar");
    click("#toggle-nav");
    expect(must(".app-window").className).toContain("nav-open");
    go("#cases");
    expect(must(".app-window").className).not.toContain("nav-open");
    // The Case File has its own pane (LP-106).
    expect(must("#toggle-nav").getAttribute("aria-controls")).toBe("case-nav");
    expect(must("#toggle-nav").getAttribute("aria-label")).toBe("Show Case File pages");
    go("#control");
    expect(document.querySelector("#toggle-nav")).toBeNull();
  });
});

describe("the Program Manager (LP-104)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
    // LP-103 and LP-104 built these in the Classic layout (LP-125).
    setShell("classic");
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().save({ id: "carl0001", name: "Carl Commissioner", title: "Court Commissioner" });
    characterStore().setActive("alice001");
  });

  afterEach(() => {
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const groups = () =>
    [...document.querySelectorAll(".pm-group")].map((g) => [
      g.querySelector(".pm-group-title")!.textContent,
      [...g.querySelectorAll(".pm-label")].map((l) => l.textContent),
    ]);

  it("shows each program's icon and name in its group, with the J.A.P. only for a Court Commissioner", () => {
    mount("");
    expect(groups()).toEqual([
      ["Court Work", ["Court Filings", "Case File", "Clients", "Law Library"]],
      ["Main", ["Control Panel", "What's new"]],
    ]);
    act(() => characterStore().setActive("carl0001"));
    expect(groups()[0][1]).toContain("J.A.P.");
    expect(must("#pm-jap").getAttribute("href")).toBe("#jap");
  });

  it("opens a program from its icon, and What's new as a dialog", () => {
    mount("");
    expect(must<HTMLAnchorElement>("#pm-library").getAttribute("href")).toBe("#library/penal-code");
    expect(must("#pm-changelog").getAttribute("aria-label")).toBe("What's new (unread)");
    click("#pm-changelog");
    expect(must<HTMLDialogElement>("#changelog-dialog").open).toBe(true);
  });

  it("moves between icons with the arrow keys", () => {
    mount("");
    const icons = [...document.querySelectorAll<HTMLElement>(".pm-icon")];
    // jsdom lays nothing out, so give each icon a place: four to a row.
    icons.forEach((el, i) => {
      el.getBoundingClientRect = () => ({ top: Math.floor(i / 4) * 80, left: (i % 4) * 100 }) as DOMRect;
    });
    act(() => icons[0].focus());
    const key = (k: string) =>
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    key("ArrowRight");
    expect(document.activeElement).toBe(icons[1]);
    key("ArrowDown");
    expect(document.activeElement).toBe(icons[5]);
    key("ArrowLeft");
    expect(document.activeElement).toBe(icons[4]);
    key("ArrowUp");
    expect(document.activeElement).toBe(icons[0]);
    key("End");
    expect(document.activeElement).toBe(icons[icons.length - 1]);
  });
});
