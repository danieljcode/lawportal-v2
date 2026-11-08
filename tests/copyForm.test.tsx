// @vitest-environment jsdom
// Make my own version (LP-225): a form split into parts, its wording editable with its look kept,
// the rest as Original text blocks that point at the built-in form (no HTML stored), fields renamed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { ALL_FORMS, getForm } from "@/data";
import { fieldLabels, formParts, renameFields, wordingOf } from "@/data/formParts";
import { copyOfForm, originalFields, templateHtml } from "@/data/myTemplates";
import { characterStore } from "@/lib/characters";
import { cleanTemplate, templateStore } from "@/lib/customTemplates";
import { compile } from "@/lib/template";
import * as sync from "@/lib/sync";
import { navigate, parseHash } from "@/shell/useRoute";
import { checkTemplateHtml } from "../scripts/template-safety.mjs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SPEEDY = "criminal-motion-to-dismiss-for-a-speedy-trial-violation";

describe("form parts", () => {
  it("split a form at its top-level elements, keeping repeating sections whole", () => {
    const html =
      '<p style="x"><span>Hello &amp; welcome</span></p>\n{{#A|1}}<p>{{B}}</p>\n{{/A}}<table><tr><td>x</td></tr></table>';
    expect(formParts(html)).toEqual([
      '<p style="x"><span>Hello &amp; welcome</span></p>',
      "\n{{#A|1}}<p>{{B}}</p>\n{{/A}}",
      "<table><tr><td>x</td></tr></table>",
    ]);
    expect(wordingOf(formParts(html)[0])).toEqual({
      text: "Hello & welcome",
      shell: '<p style="x"><span>\u0000</span></p>',
    });
    expect(wordingOf("<p>{{B}}</p>")).toBeNull();
    expect(wordingOf("<p>&nbsp;</p>")).toBeNull();
  });

  it("rename fields and keep how each fills in", () => {
    const html =
      "<p>{{Filer name@name|Firstname}} {{Grounds:textarea|&nbsp;}} {{#Charges|2}}{{$index}}{{/Charges}} {{-- Motion}}</p>";
    expect(fieldLabels(html)).toEqual(["Filer name", "Grounds"]);
    expect(renameFields(html, { "Filer name": "Your name" })).toBe(
      "<p>{{Your name@name|Firstname}} {{Grounds:textarea|&nbsp;}} {{#Charges|2}}{{$index}}{{/Charges}} {{-- Motion}}</p>",
    );
  });

  it.each(ALL_FORMS.map((f) => [f.id]))("an untouched copy of %s is the form exactly", (id) => {
    const copy = copyOfForm(id)!;
    expect(templateHtml(copy)).toBe(getForm(id)!.html);
    // Only references are kept: no HTML goes into storage or sync.
    expect(JSON.stringify(copy.blocks)).not.toMatch(/[<>]/);
  });
});

describe("a copy", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the look of reworded wording, escapes it, and renames fields", () => {
    const copy = copyOfForm(SPEEDY)!;
    expect(copy.title).toBe("Motion to Dismiss for a Speedy Trial Violation (my version)");
    const i = copy.blocks.findIndex((b) => b.text.startsWith("I, the Plaintiff/Defendant"));
    const blocks = copy.blocks.map((b, j) => (j === i ? { ...b, text: "I <b>move</b> to dismiss." } : b));
    const html = templateHtml({ ...copy, blocks, renames: { Grounds: "Reasons" } });
    expect(html).toContain('<span style="font-size:14px">I &lt;b&gt;move&lt;/b&gt; to dismiss.</span>');
    expect(html).toContain("{{Reasons:textarea|&nbsp;}}");
    expect(html).not.toContain("{{Grounds");
    expect(checkTemplateHtml(html)).toEqual([]);
    expect(() => compile(html)).not.toThrow();
    expect(originalFields(copy)).toContain("Grounds");
    // The built-in form never changes.
    expect(getForm(SPEEDY)!.html).toContain("{{Grounds:textarea|&nbsp;}}");
  });

  it("says when a part it points at has changed, and drops references it can't trust", () => {
    const copy = copyOfForm(SPEEDY)!;
    const original = copy.blocks.find((b) => b.kind === "original")!;
    const stale = { ...original, from: { ...original.from!, hash: "00000000" } };
    expect(templateHtml({ ...copy, blocks: [stale] })).toContain("Part of the original form is missing");
    const t = cleanTemplate({
      title: "X",
      blocks: [
        { kind: "original", from: { form: "<script>", part: 0, count: 1, hash: "00000000" } },
        { kind: "original", html: "<script>alert(1)</script>" },
        original,
      ],
      renames: { Grounds: "Rea{{sons}}", Other: "" },
      source: SPEEDY,
    })!;
    expect(t.blocks).toEqual([original]);
    expect(t.renames).toEqual({ Grounds: "Reasons" });
  });

  it("of an own template copies its blocks", () => {
    const saved = templateStore().save({ ...copyOfForm(SPEEDY)!, title: "Mine" });
    const again = copyOfForm("my-" + saved.id)!;
    expect(again.title).toBe("Mine (copy)");
    expect(again.blocks).toEqual(saved.blocks);
    expect(parseHash("#filings/edit/copy/" + SPEEDY)).toEqual({
      program: "filings",
      formId: null,
      edit: "copy/" + SPEEDY,
    });
  });
});

/* ---------- in the app ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Make my own version", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("copies a form into the builder, rewords it and saves it under My Templates", () => {
    history.replaceState(null, "", "#filings/" + SPEEDY);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    expect(must("#make-version").getAttribute("href")).toBe("#filings/edit/copy/" + SPEEDY);
    act(() => navigate("#filings/edit/copy/" + SPEEDY));
    expect(must("#tb-title-head").textContent).toBe("Make my own version");
    expect(must<HTMLInputElement>("#tb-title").value).toBe(
      "Motion to Dismiss for a Speedy Trial Violation (my version)",
    );
    const kinds = () => [...document.querySelectorAll(".tb-block strong")].map((s) => s.textContent);
    expect(kinds()[0]).toBe("Original text");
    expect(must(".tb-glimpse").textContent).toContain("SAN ANDREAS COURT");

    const area = [...document.querySelectorAll<HTMLTextAreaElement>(".tb-block textarea")].find((t) =>
      t.value.startsWith("I, the Plaintiff/Defendant"),
    )!;
    setValue(area, "The defence moves to dismiss.");
    const grounds = [...document.querySelectorAll<HTMLLabelElement>("#tb-renames label")].find(
      (l) => l.textContent === "Grounds",
    )!;
    setValue(must<HTMLInputElement>("#" + grounds.htmlFor), "Reasons");
    expect(must("#tb-preview").textContent).toContain("The defence moves to dismiss.");
    const before = kinds().length;
    act(() => must('[aria-label="Delete: block 1"]').click());
    expect(kinds()).toHaveLength(before - 1);
    expect(must("#tb-preview").textContent).not.toContain("COUNTY OF LOS SANTOS");

    act(() => must("#tb-save").click());
    const [t] = templateStore().list();
    expect(t).toMatchObject({ source: SPEEDY, renames: { Grounds: "Reasons" } });
    expect(location.hash).toBe("#filings/my-" + t.id);
    expect(must("#editor").textContent).toContain("Reasons");
    expect(getForm(SPEEDY)!.html).toContain("I, the Plaintiff/Defendant named above");
  });
});
