// @vitest-environment jsdom
// UI integration tests for the server-profile feature (FEAT-002): the toolbar
// server toggle, FormView date offsets, FreestyleRP court names from the data, Sidebar
// headings, and the Characters dialog Server select.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import FormView, { type FormViewProps, type FormOutput } from "@/components/FormView";
import Sidebar, { type SidebarProps } from "@/components/Sidebar";
import Toolbar, { type ToolbarProps } from "@/components/Toolbar";
import { ALL_FORMS, getForm } from "@/data";
import { characterStore } from "@/lib/characters";
import { SERVERS, SERVER_KEY, type ServerId } from "@/lib/servers";
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

function choose(sel: string, value: string): void {
  const select = must<HTMLSelectElement>(sel);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
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

/* ---------- Toolbar server toggle ---------- */

describe("Toolbar server toggle", () => {
  it("renders a server select with GTAW and FreestyleRP, and calls onServer on change", () => {
    let called: ServerId | null = null;
    const props: ToolbarProps = {
      characters: [],
      activeId: null,
      onActive: () => {},
      showDockets: false,
      showJap: false,
      syncStatus: null,
      serverId: "gtaw",
      onServer: (id) => { called = id; },
      changelogUnread: false,
      navOpen: false,
      onHome: () => {},
      onToggleNav: () => {},
      onDockets: () => {},
      onCharacters: () => {},
      onChangelog: () => {},
    };
    act(() => root.render(createElement(Toolbar, props)));

    const select = must<HTMLSelectElement>("#active-server");
    expect(select.value).toBe("gtaw");
    const options = [...select.options].map((o) => o.value + ":" + o.textContent);
    expect(options).toEqual(["gtaw:GTAW", "freestyle:FreestyleRP"]);
    expect(must("#server-badge").textContent).toBe("GTAW");

    // Simulate switching to freestyle.
    act(() => {
      select.value = "freestyle";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(called).toBe("freestyle");
  });
});

/* ---------- Sidebar court headings ---------- */

describe("Sidebar court headings", () => {
  const sidebarProps: SidebarProps = { forms: ALL_FORMS, current: null, commissioner: false };

  it("shows FreestyleRP court headings straight from the form data (LP-69)", () => {
    act(() => root.render(createElement(Sidebar, sidebarProps)));
    const summaries = [...document.querySelectorAll("#form-list summary")].map((s) => s.textContent);
    expect(summaries).toContain("San Andreas Criminal Court");
    expect(summaries).toContain("San Andreas Civil Court");
    expect(summaries).toContain("San Andreas Traffic Court");
    expect(summaries).toContain("San Andreas Small Claims Court");
    expect(summaries).toContain("San Andreas Appellate Court");
    expect(summaries).toContain("San Andreas Supreme Court");
    expect(summaries).toContain("San Andreas Court"); // "Miscellaneous"
    // Original names should not appear.
    expect(summaries).not.toContain("Superior Court of San Andreas - Criminal Division");
    expect(summaries).not.toContain("Miscellaneous");
  });
});

/* ---------- FormView: court mapping and date offset ---------- */

describe("FormView with server profiles", () => {
  function mountForm(server: typeof SERVERS.gtaw, formId = "civil-complaint") {
    let lastOutput: FormOutput | null = null;
    const form = getForm(formId);
    if (!form) throw new Error("missing form " + formId);
    const props: FormViewProps & { key: string } = {
      key: formId,
      form,
      activeCharacter: null,
      highlight: false,
      server,
      onOutput: (o: FormOutput | null) => { lastOutput = o; },
    };
    act(() => root.render(createElement(FormView, props)));
    return { getOutput: () => lastOutput, form };
  }

  it("renders mapped court phrase for freestyle in the preview and breadcrumb", () => {
    const { getOutput } = mountForm(SERVERS.freestyle, "civil-complaint");
    const o = getOutput();
    expect(o).not.toBeNull();
    // The freestyle preview should have "SAN ANDREAS COURT" instead of "SUPERIOR COURT OF THE STATE OF SAN ANDREAS".
    expect(o!.finalHtml).toContain("SAN ANDREAS COURT");
    expect(o!.finalHtml).not.toContain("SUPERIOR COURT OF THE STATE OF SAN ANDREAS");
    // Breadcrumb shows mapped court.
    expect(must("#form-crumb").textContent).toContain("San Andreas Civil Court");
  });

  it("shows the same FreestyleRP wording on gtaw: there's no translation step left (LP-69)", () => {
    const { getOutput } = mountForm(SERVERS.gtaw, "civil-complaint");
    const o = getOutput();
    expect(o).not.toBeNull();
    expect(o!.finalHtml).toContain("SAN ANDREAS COURT");
    expect(o!.finalHtml).not.toContain("SUPERIOR COURT OF THE STATE OF SAN ANDREAS");
    expect(must("#form-crumb").textContent).toContain("San Andreas Civil Court");
  });

  // Case numbers now start EMPTY in the editor; the server-aware pattern is the input
  // placeholder, and the same pattern is the blank-field OUTPUT fallback.
  const realYY = String(new Date().getUTCFullYear()).slice(-2);
  const offsetYY = String(new Date().getUTCFullYear() - 36).slice(-2);

  it("starts the Case number input empty with the 90SCCR00XXX-style pattern as placeholder and blank-field output (LP-68)", () => {
    const { getOutput } = mountForm(SERVERS.freestyle, "criminal-case-schedule");
    const o = getOutput();
    expect(o).not.toBeNull();
    const input = must<HTMLInputElement>("#f-case-number");
    expect(input.value).toBe(""); // box starts empty
    expect(input.placeholder).toBe(offsetYY + "SCCR00XXX"); // in-game year, Superior Court, criminal
    // Blank-field output still carries the pattern, and nothing GJ.
    expect(o!.finalHtml).toContain(offsetYY + "SCCR");
    expect(o!.finalHtml).not.toMatch(/\d\dGJ(CR|CC|TC|SM)/);
  });

  it("uses the same courthouse on gtaw, with the real year, until LP-70 removes it", () => {
    const { getOutput } = mountForm(SERVERS.gtaw, "criminal-case-schedule");
    const o = getOutput();
    expect(o).not.toBeNull();
    const input = must<HTMLInputElement>("#f-case-number");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe(realYY + "SCCR00XXX");
    expect(o!.finalHtml).toContain(realYY + "SCCR");
  });

  it("shows a Courthouse value that isn't one of the dropdown's options, rather than blanking it", () => {
    // A docket for 90SC… fills SUPERIOR COURT; until LP-69 the form's own options are the GTAW ones.
    localStorage.setItem(
      "lawapp_draft_criminal-case-schedule",
      JSON.stringify({ values: { Courthouse: "SUPERIOR COURT" }, autofilled: {}, derived: {} }),
    );
    const { getOutput } = mountForm(SERVERS.freestyle, "criminal-case-schedule");
    const select = must<HTMLSelectElement>("#f-courthouse");
    expect(select.value).toBe("SUPERIOR COURT");
    expect(select.selectedOptions[0].textContent).toBe("SUPERIOR COURT");
    expect(getOutput()!.finalHtml).toContain("SUPERIOR COURT");
  });

  it("builds a traffic (TC) case number the same way", () => {
    const { getOutput } = mountForm(SERVERS.freestyle, "traffic-complaint-petition");
    const o = getOutput();
    expect(o).not.toBeNull();
    const input = must<HTMLInputElement>("#f-case-number");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe(offsetYY + "SCTC00XXX");
    expect(o!.finalHtml).toContain(offsetYY + "SCTC");
    expect(o!.finalHtml).not.toContain("GJTC");
  });

  it("typing a case number fills the box and that value (not the pattern) appears in the output", () => {
    const { getOutput } = mountForm(SERVERS.gtaw, "criminal-case-schedule");
    type("#f-case-number", "26GJCR00147");
    const input = must<HTMLInputElement>("#f-case-number");
    expect(input.value).toBe("26GJCR00147");
    const o = getOutput();
    expect(o!.finalHtml).toContain("26GJCR00147");
    expect(o!.finalHtml).not.toContain("00XXX");
  });
});

/* ---------- App: switching the server toggle updates the case-number placeholder ---------- */

describe("Case number placeholder tracks the server toggle", () => {
  function mountApp() {
    act(() => root.render(createElement(App)));
  }

  it("updates the year when the toolbar server changes; the courthouse stays SC", () => {
    const realYY = String(new Date().getUTCFullYear()).slice(-2);
    const offsetYY = String(new Date().getUTCFullYear() - 36).slice(-2);
    mountApp();
    go("#criminal-case-schedule");

    const gtawInput = must<HTMLInputElement>("#f-case-number");
    expect(gtawInput.value).toBe("");
    expect(gtawInput.placeholder).toBe(realYY + "SCCR00XXX");

    choose("#active-server", "freestyle");
    const fsInput = must<HTMLInputElement>("#f-case-number");
    expect(fsInput.value).toBe("");
    expect(fsInput.placeholder).toBe(offsetYY + "SCCR00XXX"); // year shifted

    choose("#active-server", "gtaw");
    expect(must<HTMLInputElement>("#f-case-number").placeholder).toBe(realYY + "SCCR00XXX");
  });
});

/* ---------- Full App integration ---------- */

describe("App server integration", () => {
  function mountApp() {
    act(() => root.render(createElement(App)));
  }

  it("toolbar reflects gtaw by default and the badge shows GTAW", () => {
    mountApp();
    expect(must<HTMLSelectElement>("#active-server").value).toBe("gtaw");
    expect(must("#server-badge").textContent).toBe("GTAW");
  });

  it("toolbar toggle without a character persists the default in localStorage", () => {
    mountApp();
    choose("#active-server", "freestyle");
    expect(localStorage.getItem(SERVER_KEY)).toBe("freestyle");
    expect(must("#server-badge").textContent).toBe("FreestyleRP");
  });

  it("a freestyle character activates freestyle dates and courts in the preview", () => {
    mountApp();
    // Create a freestyle character.
    act(() => {
      characterStore().save({ name: "Test Char", server: "freestyle" });
      const c = characterStore().list()[0];
      characterStore().setActive(c.id);
    });
    go("#civil-complaint");
    // Toolbar should reflect freestyle.
    expect(must<HTMLSelectElement>("#active-server").value).toBe("freestyle");
    expect(must("#server-badge").textContent).toBe("FreestyleRP");
    // Sidebar should show mapped court headings.
    const summaries = [...document.querySelectorAll("#form-list summary")].map((s) => s.textContent);
    expect(summaries).toContain("San Andreas Criminal Court");
    // Breadcrumb should show mapped court.
    expect(must("#form-crumb").textContent).toContain("San Andreas Civil Court");
  });

  it("switching between characters switches the server", () => {
    mountApp();
    let idA = "";
    let idB = "";
    act(() => {
      idA = characterStore().save({ name: "A Char", server: "gtaw" }).id;
      idB = characterStore().save({ name: "B Char", server: "freestyle" }).id;
      characterStore().setActive(idA);
    });
    go("#civil-complaint");
    expect(must<HTMLSelectElement>("#active-server").value).toBe("gtaw");

    choose("#active-character", idB);
    expect(must<HTMLSelectElement>("#active-server").value).toBe("freestyle");
    expect(must("#server-badge").textContent).toBe("FreestyleRP");

    choose("#active-character", idA);
    expect(must<HTMLSelectElement>("#active-server").value).toBe("gtaw");
    expect(must("#server-badge").textContent).toBe("GTAW");
  });

  it("toggling server with a character active updates that character's server field", () => {
    mountApp();
    act(() => {
      const c = characterStore().save({ name: "My Char" });
      characterStore().setActive(c.id);
    });
    expect(must<HTMLSelectElement>("#active-server").value).toBe("gtaw");
    choose("#active-server", "freestyle");
    // The character's server field should now be 'freestyle'.
    const c = characterStore().list()[0];
    expect(c.server).toBe("freestyle");
    expect(must<HTMLSelectElement>("#active-server").value).toBe("freestyle");
  });

  it("Characters dialog shows a Server select with the character's server and saves it", () => {
    mountApp();
    click("#open-characters");
    click("#new-character");
    type("#char-name", "Jane Roe");
    // The server select defaults to gtaw.
    const sel = must<HTMLSelectElement>("#char-server");
    expect(sel.value).toBe("gtaw");
    const options = [...sel.options].map((o) => o.value + ":" + o.textContent);
    expect(options).toEqual(["gtaw:GTAW", "freestyle:FreestyleRP"]);
    // Change to freestyle and save.
    act(() => {
      sel.value = "freestyle";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    submit("#char-form");
    const c = characterStore().list()[0];
    expect(c.name).toBe("Jane Roe");
    expect(c.server).toBe("freestyle");
  });
});
