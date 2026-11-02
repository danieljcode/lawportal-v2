// @vitest-environment jsdom
// The Clients program (LP-107): new client intake and the conflict check in its
// navigation pane, Run conflict check opening the check here with the names
// filled in (and the intake kept), Open case going to the Case File, and the
// old links landing in the right place.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { markBooted } from "@/lib/boot";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { conflictLog } from "@/lib/conflicts";
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

function go(hash: string): void {
  act(() => {
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const current = () => must('#clients-nav [aria-current="page"]').textContent;
const shown = (sel: string) => !must(sel).closest("[hidden]");

describe("the Clients program (LP-107)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
    characterStore().setActive("alice001");
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", plaintiff: "People", defendant: "Ann Lee" });
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("has New client intake, Conflict check and the Rolodex in its pane", () => {
    mount("#clients/intake");
    expect([...document.querySelectorAll("#clients-nav a")].map((a) => a.textContent)).toEqual([
      "New client intake",
      "Conflict check",
      "Rolodex",
    ]);
    expect(current()).toBe("New client intake");
    expect(shown("#intake-title")).toBe(true);
    expect(shown("#conflict-form")).toBe(false);
    expect(must("#toggle-nav").getAttribute("aria-controls")).toBe("clients-nav");
    go("#clients/conflicts");
    expect(current()).toBe("Conflict check");
    expect(shown("#conflict-form")).toBe(true);
    expect(shown("#intake-title")).toBe(false);
  });

  it("runs intake's conflict check on the intake; Memo and details shows it on the Conflict check page", () => {
    mount("#clients/intake");
    setValue("#intake-clientName", "Cy Ng");
    setValue("#intake-opposingParty", "Ann Lee");
    act(() => must("#intake-conflicts").click());
    expect(location.hash).toBe("#clients/intake");
    expect(must("#intake-conflict-verdict").textContent).toBe("Possible conflict: review before accepting");
    expect(conflictLog().list()).toHaveLength(1);
    act(() => must("#intake-conflict-memo").click());
    expect(location.hash).toBe("#clients/conflicts");
    expect(current()).toBe("Conflict check");
    expect(must<HTMLTextAreaElement>("#conflict-names").value).toBe("Cy Ng\nAnn Lee");
    expect(must("#conflict-verdict").textContent).toBe("Possible conflict: review before accepting");
    expect(conflictLog().list()).toHaveLength(1);
    // Back to the intake: what was typed is still there.
    go("#clients/intake");
    expect(must<HTMLInputElement>("#intake-clientName").value).toBe("Cy Ng");
    // A second run checks again.
    setValue("#intake-opposingParty", "");
    act(() => must("#intake-conflicts").click());
    expect(must("#intake-conflict-verdict").textContent).toBe("No conflicts found");
    expect(conflictLog().list()).toHaveLength(2);
  });

  it("confirms the new case, and links to it in the Case File", () => {
    mount("#clients/intake");
    setValue("#intake-clientName", "Cy Ng");
    setValue("#intake-summary", "Arrested for jaywalking.");
    act(() => must("#intake-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const c = caseStore()
      .list()
      .find((x) => x.id !== "case0001")!;
    expect(must("#intake-opened-title").textContent).toBe("Case " + c.caseNumber + " opened");
    expect(must("#intake-open-case").getAttribute("href")).toBe("#cases/" + c.id);
  });

  it("lands the old links in the right place", () => {
    mount("#intake");
    expect(location.hash).toBe("#clients/intake");
    expect(current()).toBe("New client intake");
    go("#conflicts");
    expect(location.hash).toBe("#clients/conflicts");
    expect(current()).toBe("Conflict check");
  });
});
