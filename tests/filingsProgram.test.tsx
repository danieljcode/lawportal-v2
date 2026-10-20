// @vitest-environment jsdom
// The Court Filings program (LP-105): its navigation pane lists court forms
// only, the filing tools are in its Form menu (pick a case, open the case,
// Law Library, Draft history, Filing history), and a case-linked form is one
// click from the Case File.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { markBooted } from "@/lib/boot";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
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

const click = (sel: string) => act(() => must(sel).click());
const item = (id: string) => must<HTMLElement>("#" + id);
const off = (id: string) => item(id).getAttribute("aria-disabled") === "true";
const openForm = () => click("#menu-form");

describe("the Court Filings program (LP-105)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    markBooted();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    // A paralegal keeps no docket (judges and attorneys do), so has no case picker.
    characterStore().save({ id: "alice001", name: "Alice Clerk", title: "Paralegal" });
    characterStore().save({ id: "judy0001", name: "Judy Bench", title: "Judge" });
    characterStore().save({ id: "carl0001", name: "Carl Commissioner", title: "Court Commissioner" });
    characterStore().setActive("alice001");
    caseStore().save({
      id: "case0001",
      caseNumber: "90SCCR00147",
      plaintiff: "People",
      defendant: "Lee",
      lead: "alice001",
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

  it("lists court forms only, even for a Court Commissioner", () => {
    characterStore().setActive("carl0001");
    mount("#filings");
    const groups = [...document.querySelectorAll("#form-list summary")].map((s) => s.textContent);
    expect(groups).not.toContain("The firm");
    expect(groups).not.toContain("Court Commissioners");
    expect(groups).toContain("San Andreas Criminal Court");
    expect(document.querySelector('#form-list a[href="#jap"], #form-list a[href^="#cases"]')).toBeNull();
    // With no form open, a short "pick a form" page.
    expect(must("#empty-state").textContent).toContain("Pick a form");
  });

  it("has a Form menu only in Court Filings, with the tools off until a form is open", () => {
    mount("#cases");
    expect(document.querySelector("#menu-form")).toBeNull();
    act(() => {
      history.pushState(null, "", "#filings");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect([...document.querySelectorAll(".menu-top")].map((b) => b.textContent)).toEqual([
      "File",
      "Form",
      "View",
      "Help",
    ]);
    openForm();
    expect(off("menu-pick-case")).toBe(true);
    expect(off("menu-open-case")).toBe(true);
    expect(off("menu-law-library")).toBe(true);
    expect(off("menu-draft-history")).toBe(true);
    expect(off("menu-filing-history")).toBe(false);
    click("#menu-filing-history");
    expect(must<HTMLDialogElement>("#filings-dialog").open).toBe(true);
  });

  it("opens Law Library and Draft history for the open form, and its case in the Case File", () => {
    writeDraft(defaultKV(), "extra-general-motion", { ...EMPTY_STATE, values: { "Case number": "90SCCR00147" } });
    mount("#filings/extra-general-motion");
    openForm();
    // Anyone can open the firm case a form's case number matches.
    expect(off("menu-open-case")).toBe(false);
    expect(item("menu-open-case").getAttribute("href")).toBe("#cases/case0001");
    // Picking a case is the docket bar's, which a paralegal doesn't have.
    expect(off("menu-pick-case")).toBe(true);
    click("#menu-law-library");
    expect(must<HTMLDialogElement>("#library-dialog").open).toBe(true);
    click("#library-dialog [data-close]");
    openForm();
    click("#menu-draft-history");
    expect(must<HTMLDialogElement>("#history-dialog").open).toBe(true);
  });

  it("lets a judge pick a case from the menu, and open the loaded case in the Case File", () => {
    characterStore().setActive("judy0001");
    writeDraft(defaultKV(), "criminal-case-schedule", { ...EMPTY_STATE, values: { "Case number": "90SCCR00147" } });
    mount("#filings/criminal-case-schedule");
    openForm();
    expect(off("menu-pick-case")).toBe(false);
    click("#menu-pick-case");
    expect(document.activeElement).toBe(must("#docket-pick"));
    expect(must<HTMLAnchorElement>("#docket-open-case").getAttribute("href")).toBe("#cases/case0001");
  });

  it("keeps the tools in step when the form changes", () => {
    writeDraft(defaultKV(), "extra-general-motion", { ...EMPTY_STATE, values: { "Case number": "90SCCR00147" } });
    mount("#filings/extra-general-motion");
    act(() => {
      history.pushState(null, "", "#filings/civil-complaint");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    openForm();
    // Civil Complaint has no saved case number: nothing to open.
    expect(off("menu-open-case")).toBe(true);
    expect(off("menu-law-library")).toBe(false);
  });
});
