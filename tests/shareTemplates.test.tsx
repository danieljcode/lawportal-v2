// @vitest-environment jsdom
// Sharing own templates (LP-50): export to a .lawtpl.json file, read one back with a preview,
// reject what isn't safe or known with a reason, and rename, replace or skip on a title clash.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { templateStore, type TemplateBlock } from "@/lib/customTemplates";
import { copyOfForm, templateHtml } from "@/data/myTemplates";
import { addImported, exportFile, exportName, freeTitle, readFile } from "@/data/shareTemplates";
import * as dl from "@/lib/download";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BLOCKS: TemplateBlock[] = [
  { kind: "heading", text: "Facts" },
  { kind: "field", text: "Filer", type: "text", fill: "char:name", required: true },
];

const file = (templates: unknown[]) => JSON.stringify({ kind: "lawapp-templates", v: 1, templates });

describe("template files", () => {
  beforeEach(() => localStorage.clear());

  it("round-trip: what's exported reads back the same, without ids or times", () => {
    const a = templateStore().save({ title: "Motion to continue", blocks: BLOCKS });
    const copy = templateStore().save(copyOfForm("criminal-expungement")!);
    const text = exportFile([a, copy]);
    expect(text).not.toContain(a.id);
    expect(text).not.toContain('"updated"');
    expect(exportName([a])).toBe("motion-to-continue.lawtpl.json");
    expect(exportName([a, copy])).toBe("templates.lawtpl.json");

    const back = readFile(text, []);
    expect(back.map((x) => x.problem)).toEqual([undefined, undefined]);
    expect(back[0].template.blocks).toEqual(a.blocks);
    expect(templateHtml(back[1].template)).toBe(templateHtml(copy));
    expect(back[0].template.id).not.toBe(a.id);
  });

  it("refuses files that aren't template files, with a reason", () => {
    expect(() => readFile("not json")).toThrow("isn't a template file");
    expect(() => readFile(JSON.stringify({ kind: "other", v: 1, templates: [] }))).toThrow("isn't a lawapp template");
    expect(() => readFile(JSON.stringify({ kind: "lawapp-templates", v: 2, templates: [{}] }))).toThrow("newer lawapp");
    expect(() => readFile(file([]))).toThrow("no templates");
    expect(() => readFile("x".repeat(1_000_001))).toThrow("too big");
  });

  it("rejects a template with unknown blocks, no title or unsafe content, and never takes its id or HTML", () => {
    templateStore().save({ title: "Mine", blocks: [] });
    const mine = templateStore().list()[0];
    const items = readFile(
      file([
        {
          title: "Odd",
          blocks: [
            { kind: "heading", text: "A" },
            { kind: "script", text: "alert(1)" },
          ],
        },
        { blocks: [] },
        { title: "Words", blocks: [{ kind: "paragraph", text: "see javascript:alert(1)" }] },
        {
          id: mine.id,
          title: "Sneaky",
          html: "<script>alert(1)</script>",
          blocks: [{ kind: "heading", text: "<b>x</b>" }],
        },
      ]),
    );
    expect(items[0].problem).toBe("1 of its blocks aren't ones lawapp knows.");
    expect(items[1].problem).toBe("It has no title.");
    expect(items[2].problem).toMatch(/^It failed the safety check: dangerous scheme/);
    expect(items[3].problem).toBeUndefined();
    expect(items[3].template.id).not.toBe(mine.id);
    expect(templateHtml(items[3].template)).not.toContain("<script");

    expect(addImported(items)).toBe(1);
    expect(templateStore().get(mine.id)!.title).toBe("Mine");
  });

  it("on a title clash renames by default, or replaces or skips as chosen", () => {
    const mine = templateStore().save({ title: "Motion", blocks: [] });
    const text = file([
      { title: "motion", blocks: BLOCKS },
      { title: "Other", blocks: [] },
    ]);
    let items = readFile(text);
    expect(items[0].clash!.id).toBe(mine.id);
    expect(items[1].clash).toBeUndefined();

    expect(addImported(items)).toBe(2);
    expect(
      templateStore()
        .list()
        .map((t) => t.title),
    ).toEqual(["Motion", "motion (2)", "Other"]);

    items = readFile(text);
    expect(addImported(items, { 0: "replace", 1: "skip" })).toBe(1);
    expect(templateStore().get(mine.id)!.blocks).toEqual(BLOCKS);
    expect(templateStore().list()).toHaveLength(3);
    expect(freeTitle("A", ["a (2)", "A"])).toBe("A (3)");
  });

  it("won't go past the 50 templates", () => {
    for (let i = 0; i < 49; i++) templateStore().save({ title: "T" + i, blocks: [] });
    expect(() => addImported(readFile(file([{ title: "X" }, { title: "Y" }])))).toThrow("up to 50 templates");
    expect(templateStore().list()).toHaveLength(49);
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

describe("Share templates page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads the ticked templates and imports a file after a preview", async () => {
    templateStore().save({ title: "Motion", blocks: BLOCKS });
    templateStore().save({ title: "Notice", blocks: [] });
    const save = vi.spyOn(dl, "download").mockImplementation(() => {});
    history.replaceState(null, "", "#filings/edit/share");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));
    expect(must<HTMLAnchorElement>("#share-templates").getAttribute("href")).toBe("#filings/edit/share");

    // Untick Notice: only Motion goes in the file.
    act(() => must<HTMLInputElement>("#share-mine li:nth-child(2) input").click());
    expect(must("#share-export").textContent).toBe("Download 1 template");
    act(() => must("#share-export").click());
    const [text, name] = save.mock.calls[0] as [string, string];
    expect(name).toBe("motion.lawtpl.json");
    expect(JSON.parse(text).templates.map((t: { title: string }) => t.title)).toEqual(["Motion"]);

    // Import it back alongside a broken one: the clash defaults to a new name.
    const input = must<HTMLInputElement>("#share-file");
    const bad = { title: "Bad", blocks: [{ kind: "iframe", text: "" }] };
    const f = new File(
      [JSON.stringify({ ...JSON.parse(text), templates: [...JSON.parse(text).templates, bad] })],
      name,
    );
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(must("#share-incoming").textContent).toContain("Motion");
    expect(must("#share-problem-1").textContent).toContain("aren't ones lawapp knows");
    expect(must<HTMLSelectElement>("#share-clash-0").value).toBe("rename");
    expect(must("#share-incoming .preview").innerHTML).toContain("Facts");
    expect(must("#share-import").textContent).toBe("Add 1 template");
    act(() => must("#share-import").click());
    expect(must("#share-done").textContent).toBe("Added 1 template to My Templates.");
    expect(
      templateStore()
        .list()
        .map((t) => t.title),
    ).toEqual(["Motion", "Notice", "Motion (2)"]);
  });
});
