// @vitest-environment jsdom
// HTML → Discord markdown: hand cases per tag and rule, plus goldens and invariants on every form.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { escapeMarkdown, htmlToDiscordDoc, RULE, toDiscord, type DiscordOptions } from "@/lib/discord";
import { compile, fields, render } from "@/lib/template";
import { balanced, fenceCount, noTripleBlank, outsideFences } from "./discordAssert";
import { fixture, MD_TEXT } from "./fixtures";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const md = (html: string, opts: DiscordOptions = {}) => toDiscord(html, { parser: parse, ...opts });
const px = (n: number, t = "A") => `<p><span style="font-size:${n}px">${t}</span></p>`;
const ZW = "\u200b";

const SPOILER = (inner: string) =>
  '<div class="ipsSpoiler" data-ipsspoiler=""><div class="ipsSpoiler_header"><span>Spoiler</span></div>' +
  `<div class="ipsSpoiler_contents">${inner}</div></div>`;

/** The Civil Complaint caption: parties in a box, the ")" column, case info with a boxed title. */
const CAPTION =
  '<table style="font-size:14px"><tbody><tr>' +
  '<td><div style="border:1px solid #000000;padding:15px"><p>Ann Smith</p><p><strong>(Plaintiff)</strong></p>' +
  "<p>- against -</p><p>Bob Jones</p><p><strong>(Defendant)</strong></p></div></td>" +
  "<td><span>)<br />)<br />)<br />)<br />)</span></td>" +
  '<td><p style="text-align:center">Court File: 90SCCC00001</p><p>&nbsp;</p>' +
  '<div style="border:1px solid #000000;padding:15px"><p style="text-align:center"><strong>CIVIL COMPLAINT</strong></p></div>' +
  "<p><em>Action Filed: January 2, 2026</em></p></td>" +
  "</tr></tbody></table>";

describe("toDiscord: tags", () => {
  it("bold, italic, underline and strike", () => {
    expect(md("<p><strong>x</strong>, <b>y</b></p>")).toBe("**x**, **y**");
    // Adjacent same-format runs share one span.
    expect(md("<p><strong>x</strong> <b>y</b></p>")).toBe("**x y**");
    expect(md("<p><em>x</em>; <i>y</i></p>")).toBe("*x*; *y*");
    expect(md("<p><u>x</u></p>")).toBe("__x__");
    expect(md("<p><s>a</s>, <strike>b</strike>, <del>c</del></p>")).toBe("~~a~~, ~~b~~, ~~c~~");
  });

  it("line breaks and paragraphs", () => {
    expect(md("<p>a<br />b</p>")).toBe("a\nb");
    expect(md("<p>a<br /><br />b</p>")).toBe("a\n\nb");
    expect(md("<p>a</p>\n<p>b</p>")).toBe("a\nb");
  });

  it("lists, nested lists and ordered lists", () => {
    expect(md("<ul><li>A</li><li>B<ul><li>C</li></ul></li></ul>")).toBe("- A\n- B\n  - C");
    expect(md("<ol>\n<li>One</li>\n<li>Two</li>\n</ol>")).toBe("1. One\n2. Two");
    expect(md("<ul><li><strong>A</strong></li></ul>")).toBe("- **A**");
  });

  it("block quotes prefix every line", () => {
    expect(md("<blockquote><p>a</p><p>b<br />c</p></blockquote>")).toBe("> a\n> b\n> c");
  });

  it("inline code and pre", () => {
    expect(md("<p>run <code>x`y</code></p>")).toBe("run `xˋy`");
    expect(md("<pre>a\n```\nb</pre>")).toBe("```\na\nˋˋˋ\nb\n```");
  });

  it("drops <mark>, colours, fonts and alignment", () => {
    expect(
      md('<p style="text-align:center"><span style="color:#ff0000;font-family:Arial"><mark class="unfilled" title="N">x</mark></span></p>'),
    ).toBe("x");
  });

  it("ignores script and style", () => {
    expect(md("<p>a<script>alert(1)</script><style>p{}</style></p>")).toBe("a");
  });

  it("returns an empty string for empty input", () => {
    expect(md("")).toBe("");
    expect(md("<p>&nbsp;</p>")).toBe("");
    expect(htmlToDiscordDoc("", { parser: parse }).lines).toEqual([]);
  });
});

describe("toDiscord: nested formatting", () => {
  it("combines markers", () => {
    expect(md("<p><strong><em>x</em></strong></p>")).toBe("***x***");
    expect(md("<p><u><strong>x</strong></u></p>")).toBe("__**x**__");
    expect(md("<p><b>a <i>b</i> c</b></p>")).toBe("**a *b* c**");
    expect(md("<p><b><b>x</b></b></p>")).toBe("**x**");
  });

  it("closes spans at a line break and reopens them on the next line", () => {
    expect(md("<p><b>a<br />b</b></p>")).toBe("**a**\n**b**");
    expect(md("<p><em><u>a<br />b</u></em></p>")).toBe("*__a__*\n*__b__*");
  });

  it("keeps whitespace outside the markers and never emits empty spans", () => {
    expect(md("<p>w<b> x </b>y</p>")).toBe("w **x** y");
    expect(md("<p><b> x </b>y</p>")).toBe("**x** y");
    expect(md("<p><strong> </strong>x<em></em></p>")).toBe("x");
  });

  it("separates a closer from an opener of the same character", () => {
    expect(md("<p><b>a</b><i>b</i></p>")).toBe(`**a**${ZW}*b*`);
    expect(md("<p><u>a</u><u><b>b</b></u></p>")).toBe("__a**b**__");
    expect(md("<p><b>a</b><u>b</u></p>")).toBe("**a**__b__");
  });
});

describe("toDiscord: escaping", () => {
  it("escapes markdown characters in text", () => {
    expect(md("<p>*_~|`\\&lt;</p>")).toBe("\\*\\_\\~\\|\\`\\\\\\<");
    expect(md("<p>[x](https://e.com)</p>")).toBe("[x]\\(https://e.com)");
    expect(escapeMarkdown("<@123> <#9> <t:1>")).toBe("\\<@123> \\<#9> \\<t:1>");
  });

  it("defuses mass mentions", () => {
    expect(md("<p>@everyone and @here</p>")).toBe(`@${ZW}everyone and @${ZW}here`);
  });

  it("escapes line starts that would become headings, quotes or lists", () => {
    expect(md("<p># a</p>")).toBe("\\# a");
    expect(md("<p>## a</p>")).toBe("\\## a");
    expect(md("<p>&gt; a</p>")).toBe("\\> a");
    expect(md("<p>- a</p>")).toBe("\\- a");
    expect(md("<p>+ a</p>")).toBe("\\+ a");
    expect(md("<p>-# a</p>")).toBe("\\-# a");
    expect(md("<p>1. a</p>")).toBe("1\\. a");
    expect(md("<p>a # b - c</p>")).toBe("a # b - c");
  });

  it("user text through a template field never formats", () => {
    const tree = compile("<p><strong>Name:</strong> {{Name|NAME}}</p><ul>{{Items:list|<li>X</li>}}</ul>{{Notes:paras|<p>N</p>}}");
    const out = md(render(tree, { Name: MD_TEXT, Items: MD_TEXT, Notes: "# heading\n> quote\n1. item" }));
    const esc = "a\\*b\\_c\\~d\\|e\\`f\\\\g # > [x]\\(https://e.com) @\u200bhere \\<@1>";
    expect(out).toBe(`**Name:** ${esc}\n- ${esc}\n\\# heading\n\\> quote\n1\\. item`);
    expect(balanced(out)).toBe(true);
  });
});

describe("toDiscord: headings from font sizes", () => {
  it("maps sizes to heading levels", () => {
    expect(md(px(28))).toBe("# A");
    expect(md(px(24))).toBe("# A");
    expect(md(px(22))).toBe("## A");
    expect(md(px(20))).toBe("## A");
    expect(md(px(18))).toBe("### A");
    expect(md(px(16))).toBe("### A");
    expect(md(px(14))).toBe("A");
    expect(md(px(13))).toBe("A");
    expect(md(px(12))).toBe("-# A");
    expect(md(px(10))).toBe("-# A");
    expect(md("<p>A</p>")).toBe("A");
  });

  it("inherits sizes from ancestors, including an outer table", () => {
    expect(md('<table style="font-size:14px"><tbody><tr><td><p>A</p></td></tr></tbody></table>')).toBe("A");
    expect(md('<div style="font-size:20px"><p>A</p><p><span style="font-size:14px">B</span></p></div>')).toBe("## A\nB");
    expect(md('<p><span style="font-size:28px"><b>TITLE</b></span></p>')).toBe("# **TITLE**");
  });

  it("maps h1–h4", () => {
    expect(md("<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4>")).toBe("# A\n## B\n### C\n### D");
  });

  it("puts a heading inside a quote after the quote marker, and never on list items", () => {
    expect(md(`<blockquote>${px(28)}</blockquote>`)).toBe("> # A");
    expect(md('<ul><li><span style="font-size:28px">A</span></li></ul>')).toBe("- A");
  });

  it("uses the size of the line's first text", () => {
    expect(md('<p><span style="font-size:22px">Big</span> small</p>')).toBe("## Big small");
  });

  it("keeps long paragraphs at heading sizes as body text, but small print stays subtext", () => {
    const long = "word ".repeat(30).trim();
    expect(md(px(18, long))).toBe(long);
    expect(md(px(12, long))).toBe("-# " + long);
  });
});

describe("toDiscord: links and images", () => {
  it("makes masked links for http and https", () => {
    expect(md('<p><a href="https://e.com/x">Text</a></p>')).toBe("[Text](https://e.com/x)");
    expect(md('<p><a href="http://e.com">T</a></p>')).toBe("[T](http://e.com)");
    expect(md('<p><b><a href="https://e.com">T</a></b></p>')).toBe("**[T](https://e.com)**");
  });

  it("uses the bare URL when the text is the URL or empty", () => {
    expect(md('<p><a href="https://e.com/a_b">https://e.com/a_b</a></p>')).toBe("https://e.com/a_b");
    expect(md('<p><a href="https://e.com"></a></p>')).toBe("https://e.com");
  });

  it("keeps formatting away from a bare URL (Discord's autolink would swallow it), but spoilers stay hidden", () => {
    expect(md('<p><u>see <a href="https://e.com/a">https://e.com/a</a> now</u></p>')).toBe("__see__ https://e.com/a __now__");
    expect(md(SPOILER('<p><img src="https://e.com/a.png" /></p>'))).toBe("|| https://e.com/a.png ||");
  });

  it("keeps only the text for other schemes", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "/relative", "mailto:a@b.c", "ftp://e.com"]) {
      expect(md(`<p><a href="${href}">T</a></p>`)).toBe("T");
    }
  });

  it("encodes parentheses in the URL and escapes the link text", () => {
    expect(md('<p><a href="https://e.com/a_(b)">x [y] *z*</a></p>')).toBe("[x \\[y\\] \\*z\\*](https://e.com/a_%28b%29)");
  });

  it("puts an http(s) image URL on its own line and drops other images", () => {
    expect(md('<p>before <img src="https://e.com/a.png" alt="" /> after</p>')).toBe("before\nhttps://e.com/a.png\nafter");
    expect(md('<p>a<img src="data:image/png;base64,xx" />b<img src="x.png" /></p>')).toBe("ab");
  });
});

describe("toDiscord: rules and boxes", () => {
  it("turns <hr> into the rule line and collapses repeats", () => {
    expect(md("<p>a</p><hr /><p>b</p>")).toBe(`a\n${RULE}\nb`);
    expect(md("<p>a</p><hr /><p>&nbsp;</p><p>&nbsp;</p><hr /><p>b</p>")).toBe(`a\n${RULE}\nb`);
    expect(RULE).toBe("─".repeat(20));
  });

  it("frames a bordered div with rules", () => {
    expect(md('<div style="border:1px solid #000;padding:15px"><p>x</p></div>')).toBe(`${RULE}\nx\n${RULE}`);
    expect(md('<div style="border:none"><p>x</p></div>')).toBe("x");
  });
});

describe("toDiscord: spoilers", () => {
  it("wraps every line in || and drops the header", () => {
    expect(md(SPOILER("<p>a <b>b</b></p><p>&nbsp;</p><p>c</p>"))).toBe("||a **b**||\n\n||c||");
  });

  it("flows a grid table inside a spoiler", () => {
    const out = md(SPOILER("<table><tbody><tr><td>L</td><td>R</td></tr></tbody></table>"));
    expect(out).toBe("||L||\n||R||");
  });
});

describe("toDiscord: tables", () => {
  it("renders a grid as a fixed-width code block in code mode", () => {
    const out = md(CAPTION);
    expect(fenceCount(out)).toBe(2);
    expect(out.startsWith("```\n") && out.endsWith("\n```")).toBe(true);
    const lines = out.split("\n").slice(1, -1);
    // The ")" column lines up: five rows, all at the first row's column.
    const at = lines[0].indexOf(")");
    expect(at).toBeGreaterThan(0);
    for (let k = 0; k < 5; k++) expect(lines[k][at], lines[k]).toBe(")");
    for (const ch of ["┌", "┐", "└", "┘", "│", "─"]) expect(out).toContain(ch);
    expect(out).toContain("CIVIL COMPLAINT");
    expect(out).toContain("Court File: 90SCCC00001");
    for (const l of lines) {
      expect(l).toBe(l.trimEnd());
      expect(l.length).toBeLessThanOrEqual(40 * 3 + 4);
    }
    // Box widths stay within one column.
    for (const l of lines) for (const box of l.match(/┌─*┐/g) || []) expect(box.length).toBeLessThanOrEqual(40);
  });

  it("flows a grid as plain lines in lines mode, dropping the ) column and keeping formatting", () => {
    const out = md(CAPTION, { tables: "lines" });
    expect(out).not.toContain("```");
    expect(out.split("\n").some((l) => /^\)+$/.test(l.trim()))).toBe(false);
    expect(out).toContain("**(Plaintiff)**");
    expect(out).toContain("**CIVIL COMPLAINT**");
    expect(out).toContain("*Action Filed: January 2, 2026*");
    expect(out).toContain("\\- against -");
  });

  it("flows a layout table (one cell per row) in both modes", () => {
    const html =
      '<table style="font-size:14px"><tbody><tr><td><p><span style="font-size:28px"><b>TITLE</b></span></p></td></tr>' +
      "<tr><td><p>body</p></td></tr></tbody></table>";
    for (const tables of ["code", "lines"] as const) expect(md(html, { tables })).toBe("# **TITLE**\nbody");
  });

  it("flows a table with a long cell in code mode", () => {
    const long = "x ".repeat(250).trim();
    const out = md(`<table><tbody><tr><td><p>${long}</p></td><td><p>R</p></td></tr></tbody></table>`);
    expect(out).not.toContain("```");
    expect(out).toBe(`${long}\nR`);
  });

  it("doesn't count an image as a grid column", () => {
    const out = md(`<table><tbody><tr><td>${px(28, "COURT")}</td><td><img src="https://e.com/seal.png" /></td></tr></tbody></table>`);
    expect(out).toBe("# COURT\nhttps://e.com/seal.png");
  });

  it("keeps ``` in a cell from closing the fence", () => {
    const out = md("<table><tbody><tr><td>a```b</td><td>c</td></tr></tbody></table>");
    expect(fenceCount(out)).toBe(2);
    expect(out).toContain("aˋˋˋb  c");
  });
});

describe("toDiscord: blank lines", () => {
  it("keeps at most one blank line in a row and none at the edges", () => {
    expect(md("<p>a</p>" + "<p>&nbsp;</p>".repeat(4) + "<p>b</p>")).toBe("a\n\nb");
    expect(md("<p>&nbsp;</p><p>a</p><p>&nbsp;</p>")).toBe("a");
    expect(md("<p>a<br /><br /><br /><br />b</p>")).toBe("a\n\nb");
  });

  it("ignores whitespace between tags", () => {
    expect(md("<div>\n  <p>a</p>\n  \n  <p>b</p>\n</div>")).toBe("a\nb");
  });
});

/* ------------------------------------------------------------------ goldens */

// The old forum and site names, split so this guard doesn't show up in the brand re-grep itself.
const BRANDS = new RegExp(["gta[ .]?world", "gt" + "aw", "awu" + "card"].join("|"), "i");

function checkInvariants(id: string, out: string): void {
  const outside = outsideFences(out);
  for (const l of outside) {
    expect(/(^|[^\\])<[a-z/]/i.test(l), `${id}: raw tag in ${l}`).toBe(false);
    expect(balanced(l), `${id}: unbalanced ${l}`).toBe(true);
  }
  expect(out, id).not.toMatch(/\bundefined\b|\[object /);
  expect(noTripleBlank(out), id).toBe(true);
  expect(fenceCount(out) % 2, id).toBe(0);
  expect(out, id).not.toMatch(BRANDS);
  expect(out.trim().length, id).toBeGreaterThan(0);
}

describe("toDiscord on every form", () => {
  it("has all 45 forms", () => {
    expect(ALL_FORMS.length).toBe(45);
  });

  for (const form of ALL_FORMS) {
    it(form.id, () => {
      const tree = compile(form.html);
      const empty = render(tree, {});
      const filled = render(tree, fixture(fields(tree), "A"));
      const out = {
        emptyCode: md(empty),
        filledCode: md(filled),
        emptyLines: md(empty, { tables: "lines" }),
        filledLines: md(filled, { tables: "lines" }),
      };
      for (const [k, v] of Object.entries(out)) checkInvariants(`${form.id} ${k}`, v);
      // Forms with a text-like field show the fixture text, escaped.
      if (filled.includes("X&lt;&amp;&gt;")) expect(out.filledCode + out.filledLines).toContain('X\\<&>"1');
      expect(out.emptyCode).toMatchSnapshot("empty, code tables");
      expect(out.filledCode).toMatchSnapshot("filled, code tables");
      expect(out.emptyLines).toMatchSnapshot("empty, plain-line tables");
    });
  }
});
