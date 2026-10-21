// @vitest-environment jsdom
// The modern shell (LP-125): the default layout, with an app rail and a top bar
// round the same programs; the Windows 3.x Classic layout kept behind a setting
// (until the Classic theme, LP-112); every program in both; routes unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { characterStore } from "@/lib/characters";
import { getShell, setShell, SHELL_KEY } from "@/lib/shell";
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

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const click = (sel: string) => act(() => must(sel).click());
const title = () => must("#m-title").textContent;
const railNames = () => [...document.querySelectorAll(".m-rail .m-rail-label")].map((l) => l.textContent);

describe("the layout setting", () => {
  beforeEach(() => localStorage.clear());

  it("is modern unless Classic was chosen", () => {
    expect(getShell()).toBe("modern");
    setShell("classic");
    expect(localStorage.getItem(SHELL_KEY)).toBe("classic");
    expect(getShell()).toBe("classic");
    setShell("modern");
    expect(localStorage.getItem(SHELL_KEY)).toBeNull();
  });
});

describe("the modern shell (LP-125)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear(); // the boot screen hasn't shown this session
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

  it("is the default: a rail and a top bar, no window, taskbar or boot screen", () => {
    mount("");
    expect(must(".m-app")).toBeTruthy();
    expect(document.querySelector(".app-window, .taskbar, #boot-screen")).toBeNull();
    expect(title()).toBe("Home");
    expect(must("#home")).toBeTruthy();
    expect(document.querySelector("#program-manager")).toBeNull();
    expect(railNames()).toEqual(["Home", "Court Filings", "Case File", "Clients", "Law Library", "Control Panel"]);
    expect(must("#rail-home").getAttribute("aria-current")).toBe("page");
  });

  it("shows the J.A.P. in the rail only for a Court Commissioner", () => {
    mount("#cases");
    expect(document.querySelector("#rail-jap")).toBeNull();
    act(() => characterStore().setActive("carl0001"));
    expect(must("#rail-jap").getAttribute("href")).toBe("#jap");
  });

  it("names the program and page in the top bar, marks it in the rail, and keeps the menus", () => {
    mount("#upcoming");
    // Old links still land, rewritten (LP-103).
    expect(location.hash).toBe("#cases/upcoming");
    expect(title()).toBe("Upcoming");
    expect(must("#rail-cases").getAttribute("aria-current")).toBe("page");
    expect([...document.querySelectorAll(".m-topbar .menu-top")].map((b) => b.textContent)).toEqual([
      "File",
      "View",
      "Help",
    ]);
    go("#filings/civil-complaint");
    expect(title()).toBe("Civil Complaint");
    expect([...document.querySelectorAll(".m-topbar .menu-top")].map((b) => b.textContent)).toContain("Form");
    go("#library/precedents");
    expect(title()).toBe("Law Library");
  });

  it("switches the active character from the top bar, in every program", () => {
    for (const hash of ["#filings", "#cases", "#clients/intake", "#library/penal-code", "#control"]) {
      mount(hash);
      expect(must<HTMLSelectElement>(".m-topbar #active-character").value, hash).toBe("alice001");
      unmount();
    }
    mount("#cases");
    const picker = must<HTMLSelectElement>(".m-topbar #active-character");
    act(() => {
      picker.value = "carl0001";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(characterStore().activeId()).toBe("carl0001");
  });

  it("offers Dockets in every program's File menu, for a phone's slimmer top bar", () => {
    characterStore().save({ id: "judy0001", name: "Judy Bench", title: "Judge" });
    characterStore().setActive("judy0001");
    mount("#cases");
    click("#menu-file");
    click("#menu-dockets");
    expect(must<HTMLDialogElement>("#dockets-dialog").open).toBe(true);
  });

  it("shows the sync status in the top bar when sync is on", () => {
    vi.spyOn(sync, "code").mockReturnValue("ABCD-EFGH-IJKL");
    mount("#cases");
    expect(must(".m-topbar #sync-dot").getAttribute("aria-label")).toMatch(/^Sync: /);
  });

  it("has a ☰ for programs with a navigation pane, opening it as a drawer", () => {
    mount("#cases");
    expect(must("#toggle-nav").getAttribute("aria-controls")).toBe("case-nav");
    click("#toggle-nav");
    expect(must(".m-app").className).toContain("nav-open");
    go("#control");
    expect(must(".m-app").className).not.toContain("nav-open");
    expect(document.querySelector("#toggle-nav")).toBeNull();
  });

  it("runs every program in both layouts", () => {
    const programs: Array<[string, string]> = [
      ["#filings/civil-complaint", "#form-view"],
      ["#cases", "#case-file"],
      ["#clients/intake", "#intake-title"],
      ["#library/penal-code", "#code-q"],
      ["#control", "#control-title"],
    ];
    for (const layout of ["modern", "classic"] as const) {
      setShell(layout);
      for (const [hash, sel] of programs) {
        mount(hash);
        expect(document.querySelector(layout === "modern" ? ".m-app" : ".app-window"), layout).not.toBeNull();
        expect(document.querySelector(sel), layout + " " + hash).not.toBeNull();
        unmount();
      }
    }
    // The J.A.P. for a commissioner.
    characterStore().setActive("carl0001");
    for (const layout of ["modern", "classic"] as const) {
      setShell(layout);
      mount("#jap");
      expect(document.querySelector("#jap-output, .jap-output, #editor"), layout).not.toBeNull();
      unmount();
    }
  });

  it("switches to Classic and back from the Control Panel and the View menu", () => {
    mount("#control");
    const select = must<HTMLSelectElement>("#control-shell");
    expect(select.value).toBe("modern");
    act(() => {
      select.value = "classic";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(must(".app-window")).toBeTruthy();
    expect(must(".taskbar")).toBeTruthy();
    expect(document.querySelector(".m-app")).toBeNull();
    expect(getShell()).toBe("classic");
    // Back from the View menu.
    click("#menu-view");
    expect(must("#menu-classic").getAttribute("aria-checked")).toBe("true");
    click("#menu-classic");
    expect(must(".m-app")).toBeTruthy();
    expect(getShell()).toBe("modern");
  });
});
