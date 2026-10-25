// @vitest-environment jsdom
// The docket bar in forms on the Case File (LP-100): the firm's cases with the
// active character's first, loading one into the form, and saving the form's
// case back to the Case File (never to a per-character docket key).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
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

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement | HTMLSelectElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const groups = () =>
  [...document.querySelectorAll("#docket-pick optgroup")].map((g) => [
    g.getAttribute("label"),
    [...g.querySelectorAll("option")].map((o) => o.textContent),
  ]);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().save({ id: "bob00001", name: "Bob Lawyer", title: "Attorney at Law" });
  characterStore().setActive("alice001");
  caseStore().save({ id: "case0001", caseNumber: "90SCCC00001", plaintiff: "Ann", lead: "alice001" });
  caseStore().save({
    id: "case0002",
    caseNumber: "90SCCC00002",
    plaintiff: "Cy",
    defendant: "Dee",
    lead: "bob00001",
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

describe("the docket bar on the Case File (LP-100)", () => {
  it("lists the firm's cases, the active character's first", () => {
    mount("#civil-complaint");
    expect(must("label[for=docket-pick]").textContent).toBe("Case");
    expect(groups()).toEqual([
      ["Alice Lawyer's cases", ["90SCCC00001 · Ann"]],
      ["Other firm cases", ["90SCCC00002 · Cy v. Dee"]],
    ]);
  });

  it("loads any firm case into the form", () => {
    mount("#civil-complaint");
    setValue("#docket-pick", "case0002");
    expect(must<HTMLInputElement>("#f-case-number").value).toBe("90SCCC00002");
    expect(must<HTMLInputElement>("#f-plaintiff-name").value).toBe("Cy");
    expect(must<HTMLInputElement>("#f-defendant-name").value).toBe("Dee");
    expect(must<HTMLSelectElement>("#docket-pick").value).toBe("case0002");
  });

  it("saves a new case to the Case File with the character as lead", () => {
    mount("#civil-complaint");
    setValue("#f-case-number", "90SCCC00777");
    setValue("#f-plaintiff-name", "Eve");
    act(() => must("#docket-save").click());
    expect(must("#docket-save").textContent).toBe("Save to Case File");
    expect(caseStore().byNumber("90SCCC00777")).toMatchObject({ plaintiff: "Eve", lead: "alice001" });
    expect(must("#docket-status").textContent).toBe("Added 90SCCC00777 to the Case File, with Alice Lawyer as lead.");
  });

  it("saving another character's case updates it and puts this character on it", () => {
    mount("#civil-complaint");
    setValue("#docket-pick", "case0002");
    setValue("#f-defendant-name", "Dee Long");
    act(() => must("#docket-save").click());
    expect(caseStore().get("case0002")).toMatchObject({
      defendant: "Dee Long",
      lead: "bob00001",
      assigned: ["alice001"],
    });
    expect(must("#docket-status").textContent).toBe("Updated 90SCCC00002 in the Case File and put Alice Lawyer on it.");
    expect(caseStore().list()).toHaveLength(2);
  });

  it("saving the character's own case just updates it", () => {
    mount("#civil-complaint");
    setValue("#docket-pick", "case0001");
    setValue("#f-defendant-name", "Fay");
    act(() => must("#docket-save").click());
    expect(caseStore().get("case0001")).toMatchObject({ defendant: "Fay", lead: "alice001", assigned: [] });
    expect(must("#docket-status").textContent).toBe("Updated 90SCCC00001 in the Case File.");
  });

  it("never writes a per-character docket key", () => {
    mount("#civil-complaint");
    setValue("#f-case-number", "90SCCC00888");
    act(() => must("#docket-save").click());
    const keys = Object.keys(localStorage);
    expect(keys.filter((k) => k.startsWith("lawapp_dockets_"))).toEqual([]);
    expect(keys).toContain("lawapp_cases");
  });
});
