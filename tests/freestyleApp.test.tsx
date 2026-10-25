// @vitest-environment jsdom
// The app is FreestyleRP-only (LP-70): no server toggle or character Server
// field, in-game dates and case numbers everywhere, and FreestyleRP court names
// straight from the form data (LP-69).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import FormView, { type FormOutput, type FormViewProps } from "@/programs/filings/FormView";
import Sidebar from "@/programs/filings/Sidebar";
import { ALL_FORMS, getForm } from "@/data";
import { characterStore } from "@/lib/characters";
import { gameToday } from "@/lib/deadlines";
import { runMigrations } from "@/lib/migrations";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = $<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function click(sel: string): void {
  act(() => must(sel).click());
}

function go(hash: string): void {
  act(() => {
    history.replaceState(null, "", hash || location.pathname);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function submit(formSel: string): void {
  const form = must<HTMLFormElement>(formSel);
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function type(sel: string, value: string): void {
  const input = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  history.replaceState(null, "", "/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
  sync.__resetForTests();
});

// The in-game year: 36 years back (2026 → 1990).
const gameYear = () => gameToday().slice(0, 4);
const gameYY = () => gameYear().slice(-2);

/* ---------- Sidebar ---------- */

describe("Sidebar court headings", () => {
  it("shows FreestyleRP court headings straight from the form data (LP-69)", () => {
    act(() => root.render(createElement(Sidebar, { forms: ALL_FORMS, current: null })));
    const summaries = [...document.querySelectorAll("#form-list summary")].map((s) => s.textContent);
    for (const court of [
      "San Andreas Criminal Court",
      "San Andreas Civil Court",
      "San Andreas Traffic Court",
      "San Andreas Small Claims Court",
      "San Andreas Appellate Court",
      "San Andreas Supreme Court",
      "San Andreas Court",
    ]) {
      expect(summaries).toContain(court);
    }
    expect(summaries).not.toContain("Superior Court of San Andreas - Criminal Division");
    expect(summaries).not.toContain("Miscellaneous");
  });
});

/* ---------- FormView ---------- */

describe("FormView", () => {
  function mountForm(formId = "civil-complaint") {
    let lastOutput: FormOutput | null = null;
    const form = getForm(formId);
    if (!form) throw new Error("missing form " + formId);
    const props: FormViewProps & { key: string } = {
      key: formId,
      form,
      activeCharacter: null,
      highlight: false,
      onOutput: (o: FormOutput | null) => {
        lastOutput = o;
      },
    };
    act(() => root.render(createElement(FormView, props)));
    return { getOutput: () => lastOutput };
  }

  it("shows FreestyleRP court wording in the preview and breadcrumb", () => {
    const o = mountForm("civil-complaint").getOutput();
    expect(o!.finalHtml).toContain("SAN ANDREAS COURT");
    expect(o!.finalHtml).not.toContain("SUPERIOR COURT OF THE STATE OF SAN ANDREAS");
    expect(must("#form-crumb").textContent).toContain("San Andreas Civil Court");
  });

  it("starts the Case number empty, with the in-game 90SCCR00XXX-style pattern as placeholder and output", () => {
    const o = mountForm("criminal-case-schedule").getOutput();
    const input = must<HTMLInputElement>("#f-case-number");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe(gameYY() + "SCCR00XXX");
    expect(o!.finalHtml).toContain(gameYY() + "SCCR");
    expect(o!.finalHtml).not.toMatch(/\d\dGJ(CR|CC|TC|SM)/);
  });

  it("fills dates in the in-game year (the today prefill)", () => {
    mountForm("criminal-case-schedule");
    expect(must<HTMLInputElement>("#f-filing-date").value.slice(0, 4)).toBe(gameYear());
  });

  it("builds a traffic (TC) case number the same way", () => {
    const o = mountForm("traffic-complaint-petition").getOutput();
    expect(must<HTMLInputElement>("#f-case-number").placeholder).toBe(gameYY() + "SCTC00XXX");
    expect(o!.finalHtml).toContain(gameYY() + "SCTC");
  });

  it("shows a Courthouse value that isn't one of the dropdown's options, rather than blanking it", () => {
    localStorage.setItem(
      "lawapp_draft_criminal-case-schedule",
      JSON.stringify({ values: { Courthouse: "OLD COURTHOUSE" }, autofilled: {}, derived: {} }),
    );
    const o = mountForm("criminal-case-schedule").getOutput();
    const select = must<HTMLSelectElement>("#f-courthouse");
    expect(select.value).toBe("OLD COURTHOUSE");
    expect(select.selectedOptions[0].textContent).toBe("OLD COURTHOUSE");
    expect([...select.options].map((x) => x.value)).toContain("SUPERIOR COURT");
    expect(o!.finalHtml).toContain("OLD COURTHOUSE");
  });

  it("a typed case number replaces the pattern in the output", () => {
    const { getOutput } = mountForm("criminal-case-schedule");
    type("#f-case-number", "90SCCR00147");
    expect(must<HTMLInputElement>("#f-case-number").value).toBe("90SCCR00147");
    expect(getOutput()!.finalHtml).toContain("90SCCR00147");
    expect(getOutput()!.finalHtml).not.toContain("00XXX");
  });
});

/* ---------- App: no server choice ---------- */

describe("App without a server choice (LP-70)", () => {
  const mountApp = () => act(() => root.render(createElement(App)));

  it("has no server toggle or badge in the toolbar", () => {
    mountApp();
    expect($("#active-server")).toBeNull();
    expect($("#server-badge")).toBeNull();
  });

  it("uses the in-game year with no character active, whatever default server was saved before", () => {
    localStorage.setItem("lawapp_server", "gtaw");
    mountApp();
    go("#criminal-case-schedule");
    expect(must<HTMLInputElement>("#f-case-number").placeholder).toBe(gameYY() + "SCCR00XXX");
    expect(must<HTMLInputElement>("#f-filing-date").value.slice(0, 4)).toBe(gameYear());
  });

  it("a character saved with server: 'gtaw' before LP-70 still gets in-game dates and FreestyleRP courts", () => {
    localStorage.setItem("lawapp_chars", JSON.stringify([{ id: "oldchar1", name: "Old Gtaw", server: "gtaw" }]));
    localStorage.setItem("lawapp_active_char", "oldchar1");
    mountApp();
    go("#civil-complaint");
    expect(must<HTMLSelectElement>("#active-character").value).toBe("oldchar1");
    expect(must<HTMLInputElement>("#f-case-number").placeholder.slice(0, 2)).toBe(gameYY());
    expect(must("#form-crumb").textContent).toContain("San Andreas Civil Court");
  });

  it("on start-up, drops the old server field from saved characters and deletes the saved default (LP-71)", () => {
    localStorage.setItem(
      "lawapp_chars",
      JSON.stringify([
        { id: "oldchar1", name: "Old Gtaw", title: "Judge", server: "gtaw" },
        { id: "oldchar2", name: "Old Free", server: "freestyle" },
      ]),
    );
    localStorage.setItem("lawapp_server", "gtaw");
    // AppLoader runs the start-up migrations before App first renders (LP-2).
    runMigrations();
    mountApp();
    expect(localStorage.getItem("lawapp_server")).toBeNull();
    // Saved in the store envelope since LP-2.
    const stored = JSON.parse(localStorage.getItem("lawapp_chars")!) as { v: number; data: unknown };
    expect(stored.v).toBe(2);
    expect(stored.data).toEqual([
      { id: "oldchar1", name: "Old Gtaw", title: "Judge" },
      { id: "oldchar2", name: "Old Free" },
    ]);
  });

  it("opens a draft saved with GTAW values: the values stay, the form shows the new wording (LP-71)", () => {
    localStorage.setItem(
      "lawapp_draft_criminal-case-schedule",
      JSON.stringify({
        values: { Courthouse: "GREG E JOPLIN", "Case number": "26GJCR00147" },
        autofilled: {},
        derived: {},
      }),
    );
    mountApp();
    go("#criminal-case-schedule");
    expect(must<HTMLSelectElement>("#f-courthouse").value).toBe("GREG E JOPLIN");
    expect(must<HTMLInputElement>("#f-case-number").value).toBe("26GJCR00147");
    expect(must("#form-crumb").textContent).toContain("San Andreas Criminal Court");
  });

  it("the Characters dialog has no Server field, and a saved character has no server", () => {
    mountApp();
    click("#menu-file");
    click("#menu-characters");
    click("#new-character");
    expect($("#char-server")).toBeNull();
    type("#char-name", "Jane Roe");
    submit("#char-form");
    const c = characterStore().list()[0];
    expect(c.name).toBe("Jane Roe");
    expect(c).not.toHaveProperty("server");
  });
});
