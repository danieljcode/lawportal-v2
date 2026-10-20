// @vitest-environment jsdom
// Exhibit references in filings (LP-13): the {{Exhibits@exhibits}} list from
// the loaded case's evidence, references typed with Insert exhibit that keep
// the exhibit's id (so a reorder changes the letter), and both through the App.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { renderFiling } from "@/components/FilingsDialog";
import { fromHtml } from "@/lib/bbcode";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { toDiscord } from "@/lib/discord";
import { exhibitMarker, exhibitRefs, moveExhibit, refreshExhibitRefs, resolveExhibitRefs } from "@/lib/exhibits";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import { compile, render } from "@/lib/template";
import type { Filing } from "@/lib/filings";
import type { Exhibit } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXHIBITS: Exhibit[] = [
  { id: "exh00001", title: "Dashcam footage", link: "https://example.com/dashcam.mp4" },
  { id: "exh00002", title: "Witness statement" },
  { id: "exh00003", title: "Photo of the scene" },
];
const refs = exhibitRefs(EXHIBITS);

describe("exhibit references", () => {
  it("letter the case's exhibits in order", () => {
    expect(refs.map((r) => r.letter + " " + r.title)).toEqual([
      "A Dashcam footage",
      "B Witness statement",
      "C Photo of the scene",
    ]);
    expect(exhibitMarker(refs[2])).toBe("[Exhibit C: Photo of the scene #exh00003]");
  });

  it("resolve to the letter and title now, inside blocks too, by id", () => {
    const values = {
      Grounds: "See " + exhibitMarker(refs[0]) + " and " + exhibitMarker(refs[2]) + ".",
      "#Allegations": [{ Allegation: "Shown in " + exhibitMarker(refs[1]) }],
    };
    const moved = exhibitRefs(moveExhibit(EXHIBITS, "exh00003", -2));
    expect(resolveExhibitRefs(values, moved)).toEqual({
      Grounds: "See Exhibit B (Dashcam footage) and Exhibit A (Photo of the scene).",
      "#Allegations": [{ Allegation: "Shown in Exhibit C (Witness statement)" }],
    });
  });

  it("keep what they said, without the id, once the exhibit is gone", () => {
    const values = { Grounds: "See " + exhibitMarker(refs[1]) + "." };
    expect(resolveExhibitRefs(values, [])).toEqual({ Grounds: "See Exhibit B (Witness statement)." });
  });

  it("leave values without references alone (the same object)", () => {
    const values = { Grounds: "No exhibits [here]", Agree: true, "#Rows": [{ A: "x" }] };
    expect(resolveExhibitRefs(values, refs)).toBe(values);
    expect(refreshExhibitRefs(values, refs)).toBe(values);
  });

  it("refresh the editor text to the new letters, and keep unknown ones as typed", () => {
    const gone = "[Exhibit D: Lost #exh00009]";
    const values = { Grounds: exhibitMarker(refs[0]) + " " + gone };
    const moved = exhibitRefs(moveExhibit(EXHIBITS, "exh00001", 1));
    expect(refreshExhibitRefs(values, moved).Grounds).toBe("[Exhibit B: Dashcam footage #exh00001] " + gone);
  });
});

describe("the exhibit list token", () => {
  const tree = compile("{{Exhibits@exhibits|<p>No exhibits.</p>}}");

  it("lists each exhibit with its letter, title and link", () => {
    const out = render(tree, {}, { exhibits: refs });
    expect(out).toBe(
      "<ul>\n" +
        '<li><strong>Exhibit A</strong>: Dashcam footage (<a href="https://example.com/dashcam.mp4">https://example.com/dashcam.mp4</a>)</li>\n' +
        "<li><strong>Exhibit B</strong>: Witness statement</li>\n" +
        "<li><strong>Exhibit C</strong>: Photo of the scene</li>\n" +
        "</ul>",
    );
    expect(fromHtml(out)).toContain("Exhibit A");
    expect(toDiscord(out)).toContain("Exhibit C");
  });

  it("shows the fallback without exhibits, and ignores a typed value", () => {
    expect(render(tree, { Exhibits: "typed" })).toBe("<p>No exhibits.</p>");
    expect(render(tree, {}, { highlight: true })).toBe(
      '<mark class="unfilled" title="Exhibits"><p>No exhibits.</p></mark>',
    );
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
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function pick(sel: string, value: string): void {
  const el = must<HTMLSelectElement>(sel);
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const preview = () => must("#preview").textContent || "";

describe("Insert exhibit in a form (LP-13)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001", exhibits: EXHIBITS });
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("inserts a reference at the cursor, and a reorder changes its letter", () => {
    writeDraft(defaultKV(), "extra-general-motion", {
      ...EMPTY_STATE,
      values: { "Case number": "90SCCR00147", Grounds: "See  for the stop." },
    });
    mount("#extra-general-motion");
    const area = must<HTMLTextAreaElement>("#f-grounds");
    area.setSelectionRange(4, 4);
    const options = [...must<HTMLSelectElement>('[aria-label="Insert exhibit into Grounds"]').options];
    expect(options.map((o) => o.textContent)).toEqual([
      "Insert exhibit…",
      "Exhibit A (Dashcam footage)",
      "Exhibit B (Witness statement)",
      "Exhibit C (Photo of the scene)",
    ]);
    pick('[aria-label="Insert exhibit into Grounds"]', "exh00003");
    expect(must<HTMLTextAreaElement>("#f-grounds").value).toBe(
      "See [Exhibit C: Photo of the scene #exh00003] for the stop.",
    );
    expect(preview()).toContain("See Exhibit C (Photo of the scene) for the stop.");

    // Move it to the front in the Case File: the filing and the editor follow.
    const c = caseStore().get("case0001")!;
    act(() => {
      caseStore().save({ ...c, exhibits: moveExhibit(c.exhibits, "exh00003", -2) });
    });
    expect(preview()).toContain("See Exhibit A (Photo of the scene) for the stop.");
    expect(must<HTMLTextAreaElement>("#f-grounds").value).toContain("[Exhibit A: Photo of the scene #exh00003]");
  });

  it("lists the case's exhibits when Exhibit list is ticked", () => {
    writeDraft(defaultKV(), "extra-general-motion", {
      ...EMPTY_STATE,
      values: { "Case number": "90SCCR00147", "?Exhibit list": true },
    });
    mount("#extra-general-motion");
    expect(document.body.textContent).toContain("From the case's evidence: 3 exhibits.");
    expect(preview()).toContain("Exhibit B: Witness statement");
    expect(must("#preview").querySelector('a[href="https://example.com/dashcam.mp4"]')).not.toBeNull();
  });

  it("offers no picker without a firm case for the case number", () => {
    writeDraft(defaultKV(), "extra-general-motion", { ...EMPTY_STATE, values: { "Case number": "90SCCR09999" } });
    mount("#extra-general-motion");
    expect(document.querySelector(".exhibit-insert")).toBeNull();
  });

  it("re-renders a past filing with the case's exhibits as they are now", () => {
    const filing = {
      id: "fil00001",
      formId: "extra-general-motion",
      formTitle: "General Motion",
      caseId: "case0001",
      caseNumber: "90SCCR00147",
      state: { ...EMPTY_STATE, values: { Grounds: "See [Exhibit A: Dashcam footage #exh00001]." } },
    } as unknown as Filing;
    const c = caseStore().get("case0001")!;
    caseStore().save({ ...c, exhibits: moveExhibit(c.exhibits, "exh00001", 1) });
    expect(String(renderFiling(filing))).toContain("See Exhibit B (Dashcam footage).");
  });
});
