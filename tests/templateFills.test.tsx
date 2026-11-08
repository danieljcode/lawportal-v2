// @vitest-environment jsdom
// Fill-ins for own templates (LP-226): a field fills from the character, the case or today's
// date the way the built-in forms' fields do, and a Required tick feeds the required check (LP-87).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { getForm } from "@/data";
import { copyOfForm, requiredLabels, templateHtml } from "@/data/myTemplates";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { cleanTemplate, templateStore, type TemplateBlock } from "@/lib/customTemplates";
import { compileForm } from "@/lib/template";
import * as sync from "@/lib/sync";
import { navigate } from "@/shell/useRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELDS: TemplateBlock[] = [
  { kind: "field", text: "Filer", type: "text", fill: "char:name", required: true },
  { kind: "field", text: "Anything", type: "textarea", fill: "case:number", required: true },
  { kind: "field", text: "Defendant name", type: "text", fill: "case:defendant" },
  { kind: "field", text: "Dated", type: "text", fill: "today" },
  { kind: "field", text: "", type: "text", fill: "case:filed" },
  { kind: "field", text: "Notes", type: "textarea" },
];

describe("fill-ins", () => {
  beforeEach(() => localStorage.clear());

  it("become the same tokens the built-in forms use", () => {
    const html = templateHtml({ title: "T", blocks: FIELDS });
    expect(html).toContain("{{Filer@name|__________}}");
    expect(html).toContain("{{Case number|__________}}");
    expect(html).toContain("{{Defendant name|__________}}");
    expect(html).toContain("{{Dated=today:date:long|__________}}");
    expect(html).toContain("{{Action filed:date:long|__________}}");
    expect(html).toContain("{{Notes:textarea|__________}}");
    expect(requiredLabels({ blocks: FIELDS })).toEqual(["Filer", "Case number"]);
  });

  it("are cleaned: unknown fills and anything but a true tick go", () => {
    const t = cleanTemplate({
      title: "T",
      blocks: [
        { kind: "field", text: "A", fill: "@name", required: "yes" },
        { kind: "field", text: "B", fill: "case:number", required: true },
      ],
    })!;
    expect(t.blocks).toEqual([
      { kind: "field", text: "A", type: "text" },
      { kind: "field", text: "B", type: "text", fill: "case:number", required: true },
    ]);
  });

  it("keep a copied form's required fields, under their new names", () => {
    const copy = copyOfForm("criminal-expungement")!;
    expect(requiredLabels(copy)).toEqual(getForm("criminal-expungement")!.required);
    expect(requiredLabels({ ...copy, renames: { "Filer name": "Your name" } })).toContain("Your name");
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

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

/** The form's input for a field, by its label. */
function input(label: string): HTMLInputElement {
  const l = [...document.querySelectorAll<HTMLLabelElement>("#editor .field label")].find((x) =>
    x.textContent!.startsWith(label),
  );
  if (!l) throw new Error("no field " + label);
  return must<HTMLInputElement>("#" + CSS.escape(l.htmlFor));
}

describe("fill-ins in the app", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law", docket: true });
    characterStore().setActive("alice001");
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001", defendant: "Bob Smith" });
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("the builder offers Fills from and Required, and the form fills from the character and the case", () => {
    history.replaceState(null, "", "#filings/edit/new");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    setValue(must<HTMLInputElement>("#tb-title"), "MY MOTION");
    act(() => must("#tb-add-field").click());
    act(() => must("#tb-add-field").click());
    setValue(must<HTMLSelectElement>("#tb-block-0-fill"), "char:name");
    expect(must<HTMLInputElement>("#tb-block-0").value).toBe("Name");
    expect(document.querySelector("#tb-block-0-type")).toBeNull();
    setValue(must<HTMLSelectElement>("#tb-block-1-fill"), "case:number");
    expect(must("#tb-block-1").textContent).toBe("Case number: Pick a case fills it.");
    act(() => must<HTMLInputElement>("#tb-block-1-required").click());
    // Plain words in the menu, never tokens.
    expect(must("#tb-block-0-fill").textContent).toContain("Your name");
    expect(must("#tb-block-0-fill").textContent).not.toContain("@");

    act(() => must("#tb-save").click());
    const [t] = templateStore().list();
    expect(getForm("my-" + t.id)!.required).toEqual(["Case number"]);

    expect(input("Name").value).toBe("Alice Lawyer");
    expect(input("Case number").closest(".field")!.textContent).toContain("Required");
    setValue(must<HTMLSelectElement>("#docket-pick"), "case0001");
    expect(input("Case number").value).toBe("90SCCR00147");

    act(() => navigate("#filings/edit/" + t.id));
    expect(must<HTMLSelectElement>("#tb-block-1-fill").value).toBe("case:number");
    expect(must<HTMLInputElement>("#tb-block-1-required").checked).toBe(true);
  });

  it("compiles like a built-in form's fields", () => {
    const saved = templateStore().save({ title: "T", blocks: FIELDS });
    const { tree } = compileForm(getForm("my-" + saved.id)!, new Date("2026-11-08T12:00:00Z"));
    expect(tree).toBeTruthy();
  });
});
