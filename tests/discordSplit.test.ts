// @vitest-environment jsdom
// Splitting Discord markdown into messages: limits, balanced spans, code fences, break points, markers.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { htmlToDiscordDoc, type DiscordDoc, type TablesMode } from "@/lib/discord";
import { partMarker, splitDiscord } from "@/lib/discordSplit";
import { compile, escapeHtml, fields, render } from "@/lib/template";
import { balanced, fenceCount } from "./discordAssert";
import { fixture, LONG_TEXT } from "./fixtures";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const doc = (html: string, tables: TablesMode = "code") => htmlToDiscordDoc(html, { parser: parse, tables });
const MARKER_RE = /\n-# Part (\d+)\/(\d+)$/;

/** A part without its marker line. */
const body = (part: string) => part.replace(MARKER_RE, "");

function checkParts(id: string, parts: string[], limit: number, markers: boolean): void {
  expect(parts.length, id).toBeGreaterThan(0);
  parts.forEach((p, i) => {
    expect(p.length, `${id} part ${i + 1}`).toBeLessThanOrEqual(limit);
    expect(balanced(p), `${id} part ${i + 1} balanced`).toBe(true);
    const lines = body(p).split("\n");
    expect(lines[0], `${id} part ${i + 1} starts blank`).not.toBe("");
    expect(lines[lines.length - 1], `${id} part ${i + 1} ends blank`).not.toBe("");
    const m = MARKER_RE.exec(p);
    if (markers && parts.length > 1) {
      expect(m, `${id} part ${i + 1} marker`).not.toBeNull();
      expect([Number(m![1]), Number(m![2])]).toEqual([i + 1, parts.length]);
    } else {
      expect(m, `${id} part ${i + 1} has no marker`).toBeNull();
    }
  });
}

describe("splitDiscord basics", () => {
  it("returns [] for an empty doc", () => {
    expect(splitDiscord({ lines: [] }, { limit: 2000, markers: true })).toEqual([]);
    expect(splitDiscord(doc("<p>&nbsp;</p>"), { limit: 2000, markers: true })).toEqual([]);
  });

  it("keeps a short doc in one part with no marker", () => {
    const parts = splitDiscord(doc("<p><b>Hello</b></p><p>World</p>"), { limit: 2000, markers: true });
    expect(parts).toEqual(["**Hello**\nWorld"]);
  });

  it("formats the part marker", () => {
    expect(partMarker(1, 3)).toBe("-# Part 1/3");
  });

  it("counts the marker toward the limit", () => {
    // Ten 199-char lines fill a 2,000 message exactly (1,999 chars) without markers; with
    // markers the first part must leave room for "\n-# Part 1/2" and so holds nine.
    const html = Array.from({ length: 11 }, (_, i) => `<p>${String(i).padEnd(199, "x")}</p>`).join("");
    const plain = splitDiscord(doc(html), { limit: 2000, markers: false });
    expect(plain).toHaveLength(2);
    expect(plain[0].length).toBe(1999);
    const marked = splitDiscord(doc(html), { limit: 2000, markers: true });
    expect(marked).toHaveLength(2);
    expect(marked[0].split("\n")).toHaveLength(10);
    expect(marked[0].endsWith("\n-# Part 1/2")).toBe(true);
    for (const p of marked) expect(p.length).toBeLessThanOrEqual(2000);
  });
});

// 25 items per block nests to 625 items in some forms (megabytes of markdown), so allow time.
describe("splitDiscord on every form with a long fixture", { timeout: 60000 }, () => {
  for (const form of ALL_FORMS) {
    it(form.id, () => {
      const tree = compile(form.html);
      const html = render(tree, fixture(fields(tree), "A", { text: LONG_TEXT, items: 25 }));
      for (const tables of ["code", "lines"] as const) {
        const d = doc(html, tables);
        for (const limit of [2000, 4000]) {
          for (const markers of [true, false]) {
            const parts = splitDiscord(d, { limit, markers });
            checkParts(`${form.id} ${tables} ${limit} ${markers}`, parts, limit, markers);
          }
        }
      }
    });
  }
});

describe("splitDiscord keeps content and structure", () => {
  it("keeps every word", () => {
    const parts = splitDiscord(doc(`<p>${escapeHtml(LONG_TEXT)}</p><p>${escapeHtml(LONG_TEXT)}</p>`), { limit: 2000, markers: false });
    expect(parts.length).toBeGreaterThan(2);
    const all = parts.join("\n");
    const words = LONG_TEXT.split(/\s+/).filter((w) => /^[A-Za-z]+[.?!]?$/.test(w));
    expect(words.length).toBeGreaterThan(50);
    for (const w of words.slice(0, 50)) expect(all).toContain(w);
  });

  for (const lang of ["txt", ""]) {
    it(`closes and reopens a long code block (lang "${lang}")`, () => {
      const d: DiscordDoc = {
        lines: [{ kind: "code", lang, lines: Array.from({ length: 200 }, (_, i) => `line ${i} `.padEnd(29, "-")) }],
      };
      const parts = splitDiscord(d, { limit: 2000, markers: true });
      expect(parts.length).toBeGreaterThan(2);
      for (const p of parts) {
        expect(p.length).toBeLessThanOrEqual(2000);
        expect(p.startsWith("```" + lang + "\n")).toBe(true);
        expect(body(p).endsWith("\n```")).toBe(true);
        expect(fenceCount(p)).toBe(2);
      }
      const lines = parts.flatMap((p) => body(p).split("\n").slice(1, -1));
      expect(lines).toEqual(d.lines[0].kind === "code" ? d.lines[0].lines : []);
    });
  }

  it("hard-cuts an over-long code line", () => {
    const d: DiscordDoc = { lines: [{ kind: "code", lang: "", lines: ["y".repeat(5000)] }] };
    const parts = splitDiscord(d, { limit: 2000, markers: false });
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(2000);
      expect(fenceCount(p)).toBe(2);
    }
    expect(parts.map((p) => p.split("\n")[1]).join("")).toBe("y".repeat(5000));
  });

  it("balances a long bold paragraph in every part", () => {
    const words = Array.from({ length: 900 }, (_, i) => "w" + i).join(" ");
    const parts = splitDiscord(doc(`<p><strong>${words}</strong></p>`), { limit: 2000, markers: true });
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(2000);
      expect(balanced(p)).toBe(true);
      expect(p.startsWith("**")).toBe(true);
      expect(body(p).endsWith("**")).toBe(true);
    }
  });

  it("keeps a masked link and a spoiler whole", () => {
    const filler = "word ".repeat(380);
    const html = `<p>${filler}<a href="https://e.com/x">the link text</a> ${filler}</p>${'<div class="ipsSpoiler"><div class="ipsSpoiler_contents"><p>' + filler + "</p></div></div>"}`;
    const parts = splitDiscord(doc(html), { limit: 2000, markers: false });
    const all = parts.join("\n");
    expect(all).toContain("[the link text](https://e.com/x)");
    for (const p of parts) expect(balanced(p)).toBe(true);
  });
});

describe("splitDiscord break points", () => {
  it("breaks before a heading when one is in the second half", () => {
    const html = Array.from(
      { length: 30 },
      (_, i) => `<h2>Section ${i}</h2><p>${"para ".repeat(15)}${i}</p><p>&nbsp;</p><p>${"more ".repeat(15)}${i}</p>`,
    ).join("");
    const parts = splitDiscord(doc(html), { limit: 2000, markers: true });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.startsWith("## Section ")).toBe(true);
  });

  it("breaks at a blank line (paragraph) when there are no headings", () => {
    const html = Array.from({ length: 60 }, (_, i) => `<p>${"text ".repeat(12)}p${i}<br />second line p${i}</p><p>&nbsp;</p>`).join("");
    const d = doc(html);
    const whole = d.lines.length ? splitDiscord(d, { limit: 100000, markers: false })[0] : "";
    const parts = splitDiscord(d, { limit: 2000, markers: false });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts.slice(1)) {
      const first = p.split("\n")[0];
      expect(first.startsWith("text ")).toBe(true);
      expect(whole.includes("\n\n" + first)).toBe(true);
    }
  });

  it("breaks a long line after a sentence", () => {
    const text = Array.from({ length: 150 }, (_, i) => `Sentence number ${i} is here${["." , "?", "!"][i % 3]}`).join(" ");
    const parts = splitDiscord(doc(`<p>${text}</p>`), { limit: 2000, markers: false });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts.slice(0, -1)) expect(p).toMatch(/[.?!]$/);
    expect(parts.join(" ")).toBe(text);
  });

  it("breaks at a word when there is no sentence end", () => {
    const text = Array.from({ length: 800 }, (_, i) => "w" + i).join(" ");
    const parts = splitDiscord(doc(`<p>${text}</p>`), { limit: 2000, markers: false });
    expect(parts.join(" ")).toBe(text);
  });

  it("hard-cuts a single over-long word", () => {
    const parts = splitDiscord(doc(`<p>${"a".repeat(5000)}</p>`), { limit: 2000, markers: true });
    expect(parts.length).toBe(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(2000);
    expect(parts.map(body).join("")).toBe("a".repeat(5000));
  });

  it("never cuts a surrogate pair or an escape in half", () => {
    const emoji = splitDiscord(doc(`<p>${"😀".repeat(2500)}</p>`), { limit: 2000, markers: false });
    expect(emoji.length).toBeGreaterThan(2);
    for (const p of emoji) {
      expect(p.length).toBeLessThanOrEqual(2000);
      expect(p).toMatch(/^(😀)+$/u);
    }
    const stars = splitDiscord(doc(`<p>${"*".repeat(3000)}</p>`), { limit: 2000, markers: false });
    expect(stars.length).toBeGreaterThan(2);
    for (const p of stars) {
      expect(p.length).toBeLessThanOrEqual(2000);
      expect(p).toMatch(/^(\\\*)+$/);
    }
  });

  it("reserves room for two-digit markers", () => {
    const html = Array.from({ length: 300 }, (_, i) => `<p>${"words ".repeat(14)}${i}</p>`).join("");
    const parts = splitDiscord(doc(html), { limit: 2000, markers: true });
    expect(parts.length).toBeGreaterThanOrEqual(10);
    parts.forEach((p, i) => {
      expect(p.length).toBeLessThanOrEqual(2000);
      expect(p.endsWith("\n" + partMarker(i + 1, parts.length))).toBe(true);
    });
  });

  it("uses fewer parts at the Nitro limit", () => {
    const html = Array.from({ length: 300 }, (_, i) => `<p>${"words ".repeat(14)}${i}</p>`).join("");
    const d = doc(html);
    const a = splitDiscord(d, { limit: 2000, markers: true });
    const b = splitDiscord(d, { limit: 4000, markers: true });
    expect(b.length).toBeLessThan(a.length);
    for (const p of b) expect(p.length).toBeLessThanOrEqual(4000);
  });
});
