// @vitest-environment jsdom
// The Case File program (LP-106): its navigation pane (All cases, Upcoming,
// the open case), the links across to Clients, the case page as before, and
// the old links landing in the right place.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { markBooted } from "@/lib/boot";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { gameToday } from "@/lib/deadlines";
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

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const current = () => must('#case-nav [aria-current="page"]').textContent;

describe("the Case File program (LP-106)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
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
      deadlines: [{ id: "dl000001", date: gameToday(), label: "Hearing", done: false }],
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

  it("navigates between All cases, Upcoming and the open case", () => {
    mount("#cases");
    expect(current()).toBe("All cases");
    expect(must("#case-nav-upcoming").textContent).toBe("Upcoming (1 due soon)");
    expect(document.querySelector("#case-nav-open")).toBeNull();

    go("#cases/upcoming");
    expect(current()).toBe("Upcoming (1 due soon)");
    expect(must("#upcoming-title")).toBeTruthy();

    go("#cases/case0001");
    expect(current()).toBe("90SCCR00147");
    expect(must<HTMLAnchorElement>("#case-nav-open").getAttribute("href")).toBe("#cases/case0001");
  });

  it("keeps the case page as it was: details, deadlines, filings and evidence", () => {
    mount("#cases/case0001");
    for (const sel of ["#case-form", "#case-deadlines", "#case-filings", "#case-evidence"])
      expect(must(sel), sel).toBeTruthy();
  });

  it("links across to the Clients program for intake and the conflict check", () => {
    mount("#cases");
    expect(must("#case-nav-intake").getAttribute("href")).toBe("#clients/intake");
    expect(must("#case-nav-intake").textContent).toBe("New case from intake");
    expect(must("#case-nav-conflicts").getAttribute("href")).toBe("#clients/conflicts");
    expect(must("#case-intake").textContent).toBe("New case from intake");
    expect(must("#case-conflicts").getAttribute("href")).toBe("#clients/conflicts");
  });

  it("lands old links in the right place", () => {
    mount("#upcoming");
    expect(location.hash).toBe("#cases/upcoming");
    expect(current()).toContain("Upcoming");
    go("#cases/case0001");
    expect(current()).toBe("90SCCR00147");
    go("#cases");
    expect(current()).toBe("All cases");
  });

  it("says when the open case has gone", () => {
    mount("#cases/gone0001");
    expect(current()).toBe("Missing case");
    expect(must("#case-missing").textContent).toContain("isn't in the Case File any more");
  });
});
