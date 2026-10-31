// Colour contrast (LP-29): in each look and light or dark, the colour pairs the app puts together meet
// WCAG AA: 4.5:1 for text, 3:1 for the focus outline. axe checks the text it finds on screen (LP-118);
// this checks the theme's colours themselves, including ones axe never sees (marks, hovers, focus).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The variables every top-level block with exactly this selector sets, later ones winning. */
function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/^(\S[^{\n]*?)\s*\{([^}]*)\}/gm))
    if (m[1] === selector) for (const d of m[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}

const base = tokens(":root");
const dark = tokens(':root[data-theme="dark"]');
const modern = tokens(':root[data-look="modern"]');
// In the stylesheet's order, which is also how they win.
const SKINS: Record<string, Record<string, string>> = {
  "classic light": base,
  "classic dark": { ...base, ...dark },
  "modern light": { ...base, ...modern },
  "modern dark": { ...base, ...dark, ...modern, ...tokens(':root[data-look="modern"][data-theme="dark"]') },
};

function colour(skin: Record<string, string>, name: string): string {
  let v = skin[name];
  for (let i = 0; i < 5 && v?.startsWith("var("); i++) v = skin[v.slice(4, -1)];
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v ?? "")) throw new Error(name + " isn't a colour: " + v);
  return v.length === 4 ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v;
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [foreground, background, minimum]: each pair as the stylesheets use it. */
const PAIRS: [string, string, number][] = [
  ["--text", "--face", 4.5],
  ["--text", "--field", 4.5],
  ["--muted", "--face", 4.5],
  ["--muted", "--field", 4.5],
  ["--link", "--face", 4.5],
  ["--link", "--field", 4.5],
  ["--help-link", "--field", 4.5],
  ["--select-text", "--select-bg", 4.5],
  ["--title-text", "--title-from", 4.5],
  ["--title-text", "--title-to", 4.5],
  ["--desktop-text", "--desktop", 4.5],
  ["--task-text", "--task-bg", 4.5],
  ["--primary-text", "--primary-bg", 4.5],
  ["--alert-text", "--alert-bg", 4.5],
  ["--good", "--face", 4.5],
  ["--bad", "--face", 4.5],
  ["--text", "--mark", 4.5],
  ["--hover-text", "--light", 4.5],
  ["--focus", "--face", 3],
  ["--focus", "--field", 3],
];

describe("colour contrast (LP-29)", () => {
  for (const [skin, t] of Object.entries(SKINS))
    it(`meets WCAG AA in ${skin}`, () => {
      const low = PAIRS.map(([fg, bg, min]) => [fg, bg, min, ratio(colour(t, fg), colour(t, bg))] as const)
        .filter(([, , min, r]) => r < min)
        .map(([fg, bg, min, r]) => `${fg} on ${bg}: ${r.toFixed(2)} < ${min}`);
      expect(low).toEqual([]);
    });
});
