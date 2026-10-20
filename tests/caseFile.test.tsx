// @vitest-environment jsdom
// The Case File program through the whole App (LP-101): opening it, the list
// with leads and assigned characters, search and filters, editing a case and
// who's on it, adding and deleting cases, and the empty linked areas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
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

function go(hash: string): void {
  act(() => {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function click(sel: string): void {
  act(() => must(sel).click());
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(sel);
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
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

const rows = () => [...document.querySelectorAll(".case-row .case-num")].map((el) => el.textContent);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Judge", title: "Judge" });
  characterStore().save({ id: "bob00001", name: "Bob Lawyer", title: "Attorney at Law" });
  caseStore().save({
    id: "case0001",
    caseNumber: "90SCCR00147",
    plaintiff: "Ann",
    defendant: "Bo",
    lead: "alice001",
    assigned: ["bob00001"],
  });
  caseStore().save({ id: "case0002", caseNumber: "90SCCC00001", plaintiff: "Cy", status: "Closed", lead: "bob00001" });
  caseStore().save({ id: "case0003", caseNumber: "90SCTC00009", defendant: "Dee", lead: null, assigned: [] });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the Case File (LP-101)", () => {
  it("opens from the toolbar, and lists every firm case with who's on it", () => {
    mount("#civil-complaint");
    expect(must<HTMLAnchorElement>("#open-cases").getAttribute("href")).toBe("#cases");
    // The forms list is court forms only (LP-105): the Case File opens from the Program Manager.
    expect(document.querySelector('#sidebar a[href="#cases"]')).toBeNull();
    go("#cases");
    expect(must("#case-file-title").textContent).toBe("Case File");
    expect(document.title).toBe("Case File · Friedman & Associates: Court Filing System");
    expect(rows()).toEqual(["90SCCR00147", "90SCTC00009", "90SCCC00001"]); // open first
    const first = must(".case-row");
    expect(first.textContent).toContain("Ann v. Bo");
    expect(first.textContent).toContain("Lead: Alice Judge");
    expect(first.textContent).toContain("Also: Bob Lawyer");
    expect(document.querySelectorAll(".case-row")[1].textContent).toContain("Needs a lead");
    expect(must("#case-count").textContent).toBe("3 cases");
  });

  it("searches by case number or party, and filters by status and character", () => {
    mount("#cases");
    setValue("#case-search", "dee");
    expect(rows()).toEqual(["90SCTC00009"]);
    expect(must("#case-count").textContent).toBe("1 of 3 cases");
    setValue("#case-search", "");
    setValue("#case-filter-status", "Closed");
    expect(rows()).toEqual(["90SCCC00001"]);
    setValue("#case-filter-status", "needs-lead");
    expect(rows()).toEqual(["90SCTC00009"]);
    setValue("#case-filter-status", "");
    setValue("#case-filter-character", "bob00001");
    expect(rows()).toEqual(["90SCCR00147", "90SCCC00001"]);
    setValue("#case-search", "zzz");
    expect(must("#case-none").textContent).toBe("No cases match.");
  });

  it("edits a case's details, lead and other characters", () => {
    mount("#cases/case0003");
    expect(must("#case-form-title").textContent).toBe("90SCTC00009");
    expect(must("#case-needs-lead").textContent).toContain("no lead");
    expect(must<HTMLInputElement>("#case-defendant").value).toBe("Dee");
    setValue("#case-plaintiff", "Eve");
    setValue("#case-status", "Awaiting arguments");
    setValue("#case-notes", "Hearing moved.");
    setValue("#case-lead", "bob00001");
    act(() => must<HTMLInputElement>("#case-assigned input[type=checkbox]").click()); // Alice
    submit("#case-form");
    expect(caseStore().get("case0003")).toMatchObject({
      plaintiff: "Eve",
      defendant: "Dee",
      status: "Awaiting arguments",
      notes: "Hearing moved.",
      lead: "bob00001",
      assigned: ["alice001"],
    });
    expect(must("#case-saved").textContent).toBe("Saved.");
    expect(document.querySelector("#case-needs-lead")).toBeNull();
  });

  it("making someone lead takes them off the others", () => {
    mount("#cases/case0001");
    setValue("#case-lead", "bob00001");
    submit("#case-form");
    expect(caseStore().get("case0001")).toMatchObject({ lead: "bob00001", assigned: [] });
  });

  it("won't save a case number another case has", () => {
    mount("#cases/case0003");
    setValue("#case-caseNumber", "90sccr00147");
    submit("#case-form");
    expect(must("#case-error").textContent).toBe("90SCCR00147 is already a firm case.");
    expect(caseStore().get("case0003")?.caseNumber).toBe("90SCTC00009");
  });

  it("adds a new case and opens it", () => {
    mount("#cases");
    click("#case-new");
    expect(must("#case-form-title").textContent).toBe("New case");
    submit("#case-form");
    expect(must("#case-error").textContent).toBe("A case needs a case number.");
    setValue("#case-caseNumber", "90SCSM00005");
    setValue("#case-lead", "alice001");
    submit("#case-form");
    const made = caseStore().byNumber("90SCSM00005")!;
    expect(made).toMatchObject({ lead: "alice001", status: "Open" });
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(location.hash).toBe("#cases/" + made.id);
    expect(must("#case-form-title").textContent).toBe("90SCSM00005");
  });

  it("deletes a case after asking", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("#cases/case0002");
    click("#case-delete");
    expect(confirmSpy.mock.calls[0][0]).toContain("Delete case 90SCCC00001");
    expect(caseStore().get("case0002")).toBeNull();
  });

  it("shows labelled empty areas for filings, evidence and deadlines", () => {
    mount("#cases/case0001");
    expect(must("#case-filings h4").textContent).toBe("Filings");
    expect(must("#case-evidence h4").textContent).toBe("Evidence");
    expect(must("#case-deadlines h4").textContent).toBe("Deadlines and hearings");
    expect(must("#case-filings").textContent).toContain("No filings yet");
  });

  it("says so when a case has gone", () => {
    mount("#cases/gone0001");
    expect(must("#case-missing").textContent).toContain("isn't in the Case File any more");
  });

  it("reopens on the Case File after a reload with no hash", () => {
    mount("#cases");
    act(() => root!.unmount());
    root = null;
    container?.remove();
    mount("");
    expect(location.hash).toBe("#cases");
    expect(must("#case-file-title").textContent).toBe("Case File");
  });
});
