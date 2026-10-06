// @vitest-environment jsdom
// AC 9: HTML → BBCode, hand cases plus the per-form differential against js_bbcode.js.
import { describe, expect, it } from "vitest";
import { ALL_FORMS } from "@/data";
import { fromHtml, pxToSize } from "@/lib/bbcode";
import { compile, fields, render } from "@/lib/template";
import { fixture } from "./fixtures";
import { hasOracle, loadRefBBCode, refTemplate } from "./oracle";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const bb = (html: string) => fromHtml(html, parse);

describe("fromHtml", () => {
  it("flattens table cells to one line each and drops empty cells", () => {
    expect(bb('<table><tbody><tr><td style="text-align:center"> A </td><td></td><td>B</td></tr><tr><td>C</td></tr></tbody></table>')).toBe(
      "A\nB\n\nC\n",
    );
  });

  it("maps font-size px to [size]", () => {
    expect(bb('<p><span style="font-size:20px">Big</span></p>')).toBe("[size=6]Big[/size]\n");
    expect(bb('<p><span style="font-size:14px">Body</span></p>')).toBe("Body\n");
    expect([9, 10, 12, 15, 19, 26, 27].map(pxToSize)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("emits colour, but not for black", () => {
    expect(bb('<p><span style="color:#ff0000">Red</span></p>')).toBe("[color=#ff0000]Red[/color]\n");
    expect(bb('<p><span style="color:#000000">Black</span> <span style="color:black">B</span></p>')).toBe("Black B\n");
  });

  it("aligns paragraphs", () => {
    expect(bb('<p style="text-align:center">Mid</p>')).toBe("[center]Mid[/center]\n");
    expect(bb('<p style="text-align:right">R</p><p style="text-align:justify">J</p>')).toBe("[right]R[/right]\n\n[justify]J[/justify]\n");
  });

  it("turns the spoiler div into [spoiler] and drops the header", () => {
    const html =
      '<div class="ipsSpoiler" data-ipsspoiler=""><div class="ipsSpoiler_header"><span>Spoiler</span></div><div class="ipsSpoiler_contents"><p>Hidden</p></div></div>';
    expect(bb(html)).toBe("[spoiler]Hidden[/spoiler]\n");
  });

  it("converts lists", () => {
    expect(bb("<ol><li>One</li><li>Two</li></ol>")).toBe("[list=1]\n[*]One\n[*]Two\n[/list]\n");
    expect(bb("<ul> <li><strong>A</strong></li></ul>")).toBe("[list]\n[*][b]A[/b]\n[/list]\n");
  });

  it("converts inline tags, links, images and drops <mark>", () => {
    expect(bb('<p><b>B</b> <i>I</i> <u>U</u> <s>S</s> <a href="https://e.com">L</a> <img src="https://e.com/a.png"></p>')).toBe(
      "[b]B[/b] [i]I[/i] [u]U[/u] [s]S[/s] [url=https://e.com]L[/url] [img]https://e.com/a.png[/img]\n",
    );
    expect(bb('<p><mark class="unfilled" title="X">NAME</mark></p>')).toBe("NAME\n");
    expect(bb("<p><strong> </strong>x</p>")).toBe("x\n");
  });

  it("collapses 3+ newlines to 2 and ends with exactly one newline", () => {
    const out = bb("<p>a</p><br><br><br><br><p>b</p>\n\n");
    expect(out).toBe("a\n\nb\n");
    expect(out.endsWith("\n") && !out.endsWith("\n\n")).toBe(true);
    expect(bb("<p>a&nbsp;&nbsp;</p><hr>")).toBe("a\n\n[hr]\n");
  });
});

describe.skipIf(!hasOracle)("fromHtml parity with the reference", () => {
  for (const form of ALL_FORMS) {
    it(form.id, () => {
      const ref = loadRefBBCode();
      const tree = compile(form.html);
      const refTree = refTemplate!.compile(form.html);
      const values = fixture(refTemplate!.fields(refTree), "A");
      for (const html of [render(tree, {}), render(tree, values)]) {
        expect(fromHtml(html)).toBe(ref.fromHtml(html));
      }
      // The highlighted preview also converts the same (marks are dropped).
      const marked = render(tree, {}, { highlight: true });
      expect(fromHtml(marked)).toBe(ref.fromHtml(marked));
      expect(fields(tree).length).toBeGreaterThan(0);
    });
  }
});
