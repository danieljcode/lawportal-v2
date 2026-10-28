// The stylesheets (LP-110): what differs between looks is a variable, set once in globals.css. A
// program's own stylesheet never hard-codes colours, fonts, font sizes, radii or bevels, and every
// variable used is defined (a typo would quietly drop the declaration). The forum preview, the
// Discord message, the boot screen and the print sheets keep fixed looks on purpose.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../src");
const GLOBALS = path.join(SRC, "app/globals.css");
const PROGRAMS = readdirSync(path.join(SRC, "programs"))
  .map((p) => path.join(SRC, "programs", p, p + ".css"))
  .filter((f) => {
    try {
      readFileSync(f);
      return true;
    } catch {
      return false;
    }
  });

const read = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** Each declaration with the selector and @media it sits in. */
function declarations(css: string): Array<{ selector: string; media: string; prop: string; value: string }> {
  const out: Array<{ selector: string; media: string; prop: string; value: string }> = [];
  const stack: string[] = [];
  for (const m of css.matchAll(/([^{};]+)\{|\}|([\w-]+)\s*:\s*([^;{}]+);/g)) {
    if (m[1] !== undefined) stack.push(m[1].trim());
    else if (m[0] === "}") stack.pop();
    else {
      const media = stack.filter((s) => s.startsWith("@")).join(" ");
      out.push({ selector: stack.filter((s) => !s.startsWith("@")).join(" "), media, prop: m[2], value: m[3].trim() });
    }
  }
  return out;
}
// `.post` itself, not `.post-frame` (the themed frame round the preview).
const UNTHEMED = /\.post(?![\w-])|\.dc-(message|frame)(?![\w-])|\.boot-|:has\(#/;

describe("program stylesheets (LP-110)", () => {
  it("exist for the programs with their own styles", () => {
    expect(PROGRAMS.map((f) => path.basename(f)).sort()).toEqual([
      "cases.css",
      "clients.css",
      "filings.css",
      "library.css",
    ]);
  });

  it("give each selector one block of its own (LP-156)", () => {
    // Shared groups (`.btn, .mini { … }`) are fine; a second `.mini { … }` is the later one silently winning.
    const ok = new Set([":root"]); // skin colours and look tokens, split on purpose (globals.css)
    const twice: string[] = [];
    for (const f of [GLOBALS, ...PROGRAMS]) {
      const seen = new Set<string>();
      const stack: string[] = [];
      for (const m of read(f).matchAll(/([^{};]+)\{|\}/g)) {
        if (m[1] === undefined) {
          stack.pop();
          continue;
        }
        const selector = m[1].trim().replace(/\s+/g, " ");
        const key = [...stack, selector].join(" | ");
        if (!selector.startsWith("@") && !selector.includes(",") && !ok.has(selector) && seen.has(key))
          twice.push(`${path.basename(f)}: ${key}`);
        seen.add(key);
        stack.push(selector);
      }
    }
    expect(twice).toEqual([]);
  });

  it("hard-code no colours, fonts, font sizes, radii or bevels", () => {
    const bad: string[] = [];
    for (const f of PROGRAMS) {
      for (const d of declarations(read(f))) {
        if (d.prop.startsWith("--") || UNTHEMED.test(d.selector) || d.media.includes("print")) continue;
        const v = d.value;
        const hit =
          /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v) ||
          (d.prop === "font-family" && !/^var\(/.test(v)) ||
          (d.prop === "font-size" && /\d(px|rem|em)\b/.test(v)) ||
          (d.prop.endsWith("radius") && /[1-9]\d*px/.test(v)) ||
          (d.prop === "box-shadow" && !/^(var\(|none)/.test(v));
        if (hit) bad.push(`${path.basename(f)}: ${d.selector} { ${d.prop}: ${v} }`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("variables (LP-110)", () => {
  it("are all defined", () => {
    const sheets = [GLOBALS, ...PROGRAMS].map(read).join("\n");
    const defined = new Set([...sheets.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...sheets.matchAll(/var\((--[\w-]+)\s*[,)]/g)].map((m) => m[1]));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });

  it("are the only bevels: no box-shadow outside the token definitions spells out the 1990 insets", () => {
    const bad = declarations(read(GLOBALS)).filter(
      (d) => d.prop === "box-shadow" && /inset -?\dpx -?\dpx/.test(d.value) && !UNTHEMED.test(d.selector),
    );
    expect(bad.map((d) => d.selector)).toEqual([]);
  });

  it("are all a look sets: data-look rules hold only variables, so the layout is the same in both", () => {
    const css = [GLOBALS, ...PROGRAMS].map(read).join("\n");
    const lookRules = declarations(css).filter((d) => d.selector.includes("data-look"));
    expect(lookRules.length).toBeGreaterThan(50);
    expect(lookRules.filter((d) => !d.prop.startsWith("--") && d.prop !== "color-scheme")).toEqual([]);
  });

  it("include the look tokens, with the 1990 values for now", () => {
    const css = read(GLOBALS);
    for (const t of ["--bevel-raised", "--bevel-sunken", "--radius", "--text-base", "--control-height", "--ui-font"])
      expect(css, t).toMatch(new RegExp(t + "\\s*:"));
    expect(css).toMatch(/--radius:\s*0;/);
  });
});
