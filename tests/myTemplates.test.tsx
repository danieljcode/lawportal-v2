// @vitest-environment jsdom
// The firm's own templates (LP-49): blocks become safe token HTML for the engine, they're stored,
// synced and found by id like any form, and the builder adds, moves and deletes blocks with a preview.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { getForm } from "@/data";
import { formInfo } from "@/data/form-index";
import { templateHtml } from "@/data/myTemplates";
import { characterStore } from "@/lib/characters";
import { cleanTemplate, templateStore, type TemplateBlock } from "@/lib/customTemplates";
import { compile, render } from "@/lib/template";
import { resolve } from "@/lib/sync";
import * as sync from "@/lib/sync";
import { hashFor, navigate, parseHash } from "@/shell/useRoute";
import { checkTemplateHtml } from "../scripts/template-safety.mjs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BLOCKS: TemplateBlock[] = [
  { kind: "heading", text: "Facts <b>here</b>" },
  { kind: "paragraph", text: "Line one {{Evil}}\nline two\n\nNext & last" },
  { kind: "field", text: "Defendant {name}|x", type: "text" },
  { kind: "field", text: "Hearing date", type: "date" },
  { kind: "list", text: "Allegations" },
  { kind: "list", text: "Allegations" },
  { kind: "signature", text: "Attorney for the <Plaintiff>" },
];

describe("templateHtml", () => {
  it("escapes the firm's words, keeps tokens out of them and passes the safety check", () => {
    const html = templateHtml({ title: 'MOTION "<script>"', blocks: BLOCKS });
    expect(checkTemplateHtml(html)).toEqual([]);
    expect(html).toContain("MOTION &quot;&lt;script&gt;&quot;");
    expect(html).toContain("<p><strong><u>Facts &lt;b&gt;here&lt;/b&gt;</u></strong></p>");
    expect(html).toContain("<p>Line one &#123;&#123;Evil&#125;&#125;<br />\nline two</p>\n<p>Next &amp; last</p>");
    expect(html).toContain("{{Defendant namex|__________}}");
    expect(html).toContain("{{Hearing date:date:long|__________}}");
    expect(html).toContain("{{#Allegations|1}}");
    expect(html).toContain("{{#Allegations 2|1}}");
    expect(html).toContain("{{Role@title|Attorney for the &lt;Plaintiff&gt;}}");

    const out = render(compile(html), { "Defendant namex": "<i>Bob</i>" });
    expect(out).toContain("&lt;i&gt;Bob&lt;/i&gt;");
    expect(out).not.toContain("Evil}}");
  });
});

describe("own templates", () => {
  beforeEach(() => localStorage.clear());

  it("are cleaned: a title is needed, unknown blocks go", () => {
    expect(cleanTemplate({ title: " ", blocks: [] })).toBeNull();
    const t = cleanTemplate({
      id: "tmpl0001",
      title: "Motion",
      blocks: [{ kind: "script", text: "x" }, { kind: "field", text: "Name", type: "weird" }, null],
    })!;
    expect(t.blocks).toEqual([{ kind: "field", text: "Name", type: "text" }]);
  });

  it("open by id like any form, and keep their place when saved again", () => {
    const a = templateStore().save({ id: "tmpl0001", title: "First", blocks: BLOCKS });
    templateStore().save({ id: "tmpl0002", title: "Second", blocks: [] });
    templateStore().save({ ...a, title: "First again" });
    expect(
      templateStore()
        .list()
        .map((t) => t.title),
    ).toEqual(["First again", "Second"]);
    expect(formInfo("my-tmpl0001")).toEqual({
      id: "my-tmpl0001",
      court: "My Templates",
      section: "",
      title: "First again",
    });
    expect(getForm("my-tmpl0001")!.html).toContain("First again");
    expect(getForm("my-tmpl0001")).toBe(getForm("my-tmpl0001"));
    expect(getForm("my-gone0000")).toBeUndefined();
    expect(parseHash("#filings/my-tmpl0001")).toEqual({ program: "filings", formId: "my-tmpl0001" });
    expect(parseHash("#filings/edit/new")).toEqual({ program: "filings", formId: null, edit: "new" });
    expect(hashFor({ program: "filings", formId: null, edit: "tmpl0001" })).toBe("#filings/edit/tmpl0001");
    templateStore().remove("tmpl0002");
    expect(templateStore().list()).toHaveLength(1);
  });

  it("sync: another device's templates are taken", () => {
    const theirs = { id: "tmpl0009", title: "Theirs", blocks: [], updated: "2026-11-08T00:00:00.000Z" };
    const { doc } = resolve({ characters: [], cases: [], templates: [theirs] }, null);
    expect(doc.templates).toMatchObject([{ id: "tmpl0009", title: "Theirs" }]);
  });
});

/* ---------- the builder ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

describe("the template builder", () => {
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

  it("builds a template, saves it under My Templates, edits and deletes it", () => {
    history.replaceState(null, "", "#filings");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    expect(must("#new-template").getAttribute("href")).toBe("#filings/edit/new");
    act(() => navigate("#filings/edit/new"));
    expect(location.hash).toBe("#filings/edit/new");
    act(() => must("#tb-save").click());
    expect(must("#tb-error").textContent).toBe("Give the template a title.");

    setValue(must<HTMLInputElement>("#tb-title"), "MOTION TO CONTINUE");
    for (const k of ["paragraph", "field", "heading", "signature"]) act(() => must("#tb-add-" + k).click());
    setValue(must<HTMLTextAreaElement>("#tb-block-0"), "The defence asks for more time.");
    setValue(must<HTMLInputElement>("#tb-block-1"), "Reason");
    setValue(must<HTMLSelectElement>("#tb-block-1-type"), "textarea");
    setValue(must<HTMLInputElement>("#tb-block-2"), "Grounds");
    act(() => must('[aria-label="Move up: block 3"]').click());
    act(() => must('[aria-label="Move up: block 2"]').click());
    expect([...document.querySelectorAll(".tb-block strong")].map((s) => s.textContent)).toEqual([
      "Heading",
      "Paragraph",
      "Field",
      "Signature",
    ]);
    act(() => must('[aria-label="Delete: block 4"]').click());
    const preview = must("#tb-preview").innerHTML;
    expect(preview).toContain("MOTION TO CONTINUE");
    expect(preview.indexOf("Grounds")).toBeLessThan(preview.indexOf("The defence asks"));

    act(() => must("#tb-save").click());
    const [t] = templateStore().list();
    expect(t).toMatchObject({
      title: "MOTION TO CONTINUE",
      blocks: [{ kind: "heading" }, { kind: "paragraph" }, { kind: "field", type: "textarea" }],
    });
    expect(location.hash).toBe("#filings/my-" + t.id);
    expect(must("#form-list").textContent).toContain("My Templates");
    expect(must("#editor").textContent).toContain("Reason");

    expect(must('[aria-label="Edit template: MOTION TO CONTINUE"]').getAttribute("href")).toBe("#filings/edit/" + t.id);
    act(() => navigate("#filings/edit/" + t.id));
    expect(must<HTMLInputElement>("#tb-title").value).toBe("MOTION TO CONTINUE");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    act(() => must("#tb-delete").click());
    expect(templateStore().list()).toEqual([]);
    expect(location.hash).toBe("#filings");
    expect(must("#form-list").textContent).not.toContain("My Templates");
  });
});
