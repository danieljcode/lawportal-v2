// AC 27 (template safety), the old-forum link scrub, and R4 (no latin-1 double-encoded text under src/).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { hasRefForms, paritySuite, REF_FORMS } from "./oracle";
import { toFreestyle } from "../scripts/freestyle-wording.mjs";
import { unwrapBlockedLinks } from "../scripts/scrub-links.mjs";
import { checkTemplateHtml } from "../scripts/template-safety.mjs";

describe("checkTemplateHtml", () => {
  it.each(ALL_FORMS.map((f) => [f.id, f.html]))("%s has no problems", (_id, html) => {
    expect(checkTemplateHtml(html)).toEqual([]);
  });

  it.each([
    "<p><script>alert(1)</script></p>",
    "<p><svg></svg></p>",
    '<p onclick="x()">x</p>',
    '<a href="javascript:x">x</a>',
    '<img src="data:text/html,x">',
    '<a href="/relative">x</a>',
  ])("reports one problem for %s", (html) => {
    expect(checkTemplateHtml(html)).toHaveLength(1);
  });

  it("checks fallback HTML inside tokens and unquoted values", () => {
    expect(checkTemplateHtml("{{Name|<a href=/x>X</a>}}")).toHaveLength(1);
    expect(checkTemplateHtml('<img src="https://i.ibb.co/a.png"><img src="data:image/png;base64,AA">')).toEqual([
      'src is not an http(s) URL: "data:image/png;base64,AA"',
    ]);
  });
});

describe("unwrapBlockedLinks", () => {
  it("unwraps links to the old forum hosts and keeps the text", () => {
    expect(unwrapBlockedLinks('<p>See <a href="https://forum.gta.world/x?a=1&amp;b=2">the <b>form</b></a>.</p>')).toBe(
      "<p>See the <b>form</b>.</p>",
    );
    expect(unwrapBlockedLinks("<a href='https://lssd.gta.world/t'>CSB</a>")).toBe("CSB");
    expect(unwrapBlockedLinks("(( Screenshot from banking.gta.world ))")).toBe("(( Screenshot from online banking ))");
  });

  it("leaves other links alone", () => {
    for (const html of ['<a href="https://example.com/">x</a>', '<a href="https://notgta.world.example/">x</a>', "<a>x</a>"]) {
      expect(unwrapBlockedLinks(html)).toBe(html);
    }
  });

  it.each(ALL_FORMS.map((f) => [f.id, f.html]))("%s has no old forum hosts", (_id, html) => {
    expect(html).not.toMatch(/gta\.?world/i);
    expect(unwrapBlockedLinks(html)).toBe(html);
  });

  // forms.json must be exactly what port-forms writes: scrubbed links, then FreestyleRP wording
  // (so it fails if courts.ts or the wording changed without re-running port-forms).
  it.skipIf(!hasRefForms)(paritySuite("matches the reference forms as port-forms writes them", hasRefForms), () => {
    const text = readFileSync(REF_FORMS, "utf8");
    const ref = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as Array<Record<string, string>>;
    expect(ALL_FORMS.filter((f) => ref.some((r) => r.id === f.id)).map((f) => [f.id, f.court, f.html])).toEqual(
      ref.map((r) => {
        const out = toFreestyle({ ...r, html: unwrapBlockedLinks(r.html) });
        return [r.id, out.court, out.html];
      }),
    );
  });
});

describe("source encoding (R4)", () => {
  const srcDir = path.resolve(process.cwd(), "src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(srcDir);

  it("finds source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(srcDir, f)]))("%s has no mojibake", (rel) => {
    const text = readFileSync(path.join(srcDir, rel), "utf8");
    expect(text).not.toMatch(/[\u00c2\u00c3\u00e2][\u0080-\u00bf]/);
  });
});
