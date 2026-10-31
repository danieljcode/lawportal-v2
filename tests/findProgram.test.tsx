// @vitest-environment jsdom
// The Find page (LP-95): search as you type, results grouped with the words marked,
// each linking into its program; and Ctrl+Shift+F opens it from anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { contactStore } from "@/lib/contacts";
import * as sync from "@/lib/sync";
import FindProgram from "@/programs/find";
import type { ProgramProps } from "@/shell/program";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const must = <T extends HTMLElement = HTMLElement>(sel: string) => {
  const el = container.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
};

function render(el: ReturnType<typeof createElement>): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(el));
}

function type(text: string): void {
  const input = must<HTMLInputElement>("#find-q");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  caseStore().replaceAll([]);
  contactStore().replaceAll([]);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the Find page (LP-95)", () => {
  it("finds as you type, grouped, with the words marked and links into each program", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", defendant: "John Smith", lead: "alice001" });
    contactStore().save({ name: "Judy Smithers", type: "client" });
    const shell = { characters: [], active: null, visible: true } as unknown as ProgramProps["shell"];
    render(createElement(FindProgram, { shell }));

    expect(must("#find-count").textContent).toMatch(/Searches cases/);
    type("smith");
    expect([...container.querySelectorAll(".find-group h3")].map((h) => h.firstChild?.textContent?.trim())).toEqual([
      "Cases",
      "Contacts",
    ]);
    expect(must("#find-count").textContent).toBe("2 found");
    expect(must("#case-case0001").getAttribute("href")).toBe("#cases/case0001");
    expect([...container.querySelectorAll(".find-list mark")].map((m) => m.textContent)).toEqual(["Smith", "Smith"]);

    type("90-sc-cr");
    expect(must("#case-case0001")).toBeTruthy();
    type("nobody here");
    expect(must("#find-count").textContent).toBe("Nothing found.");
  });

  it("opens with Ctrl+Shift+F from anywhere", () => {
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    history.replaceState(null, "", "#cases");
    render(createElement(App));
    const e = new KeyboardEvent("keydown", {
      key: "F",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.body.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(location.hash).toBe("#find");
  });
});
