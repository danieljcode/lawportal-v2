// @vitest-environment jsdom
// Everything typed reaches every output (LP-211): each typed field of every form gets its own value,
// and each one the filing shows must also be in the BBCode, the Discord text and the .docx. Catches
// a converter that drops a table cell or a block item, which no single converter's suite compares.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { fromHtml } from "@/lib/bbcode";
import { toDiscord } from "@/lib/discord";
import { htmlToDocx } from "@/lib/docx/htmlToDocx";
import { compile, fields, render } from "@/lib/template";
import type { Values } from "@/lib/types";
import { fixture } from "./fixtures";
import { readZipText } from "./zip";

const TYPED = new Set(["text", "textarea", "list", "paras", "spoiler"]);

describe("every typed value reaches every output (LP-211)", () => {
  it(`on all ${ALL_FORMS.length} forms`, { timeout: 180_000 }, async () => {
    let checked = 0;
    for (const form of ALL_FORMS) {
      const tree = compile(form.html);
      const entries = fields(tree);
      const typed = new Set<string>();
      const walk = (list: readonly unknown[]) => {
        for (const e of list as Array<{ field?: { label: string; type: string }; fields?: unknown[] }>) {
          if (e.field && TYPED.has(e.field.type)) typed.add(e.field.label);
          if (e.fields) walk(e.fields);
        }
      };
      walk(entries);
      // Fixture A, with every typed field (in every block item) given a value of its own: "QZ1QZ", "QZ2QZ"…
      let n = 0;
      const give = (values: Values): Values => {
        const out: Values = {};
        for (const [key, v] of Object.entries(values)) {
          if (Array.isArray(v)) out[key] = v.map(give);
          else out[key] = typed.has(key) ? "QZ" + ++n + "QZ" : v;
        }
        return out;
      };
      const values = give(fixture(entries, "A"));
      const html = render(tree, values);
      const shown = [...new Set(html.match(/QZ\d+QZ/g) ?? [])];
      const bbcode = fromHtml(html);
      const discord = toDiscord(html);
      const docx = readZipText(
        Buffer.from(await (await htmlToDocx(html, form.title)).arrayBuffer()),
        "word/document.xml",
      );
      for (const t of shown) {
        expect(bbcode, `${form.id}: ${t} in BBCode`).toContain(t);
        expect(discord, `${form.id}: ${t} in Discord`).toContain(t);
        expect(docx, `${form.id}: ${t} in .docx`).toContain(t);
      }
      checked += shown.length;
    }
    // The LP-200 audit found 585 typed values the filings show; far fewer means the check has gone blind.
    expect(checked).toBeGreaterThan(500);
  });
});
