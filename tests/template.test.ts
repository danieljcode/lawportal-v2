// AC 6: unit tests for the template engine.
import { describe, expect, it } from "vitest";
import { ALL_FORMS, getForm } from "@/data";
import {
  addDays,
  caseNumberPattern,
  compile,
  dateRule,
  defaultItems,
  escapeHtml,
  fields,
  formatDate,
  plain,
  prefillDeps,
  prefillValue,
  render,
  todayUTC,
} from "@/lib/template";
import { getServerDate, SERVERS } from "@/lib/servers";
import type { BlockEntry, CondEntry, Entry, Field } from "@/lib/types";

/** The first field token of a one-token template. */
function field(token: string): Field {
  const entry = fields(compile(token))[0];
  if (!entry || !("field" in entry)) throw new Error("no field in " + token);
  return entry.field;
}

function blockOf(entries: Entry[], name: string): BlockEntry {
  const e = entries.find((x): x is BlockEntry => "block" in x && x.block.name === name);
  if (!e) throw new Error("no block " + name);
  return e;
}

function labels(entries: Entry[]): string[] {
  return entries.map((e) =>
    "field" in e ? e.field.label : "block" in e ? "#" + e.block.name : "cond" in e ? "?" + e.cond.name : "--" + e.section,
  );
}

const NOW = new Date("2026-03-10T15:00:00Z");

describe("formatDate", () => {
  const cases: Array<[string | undefined, string]> = [
    [undefined, "January 5, 2026"],
    ["long", "January 5, 2026"],
    ["short", "05/JAN/2026"],
    ["daymon", "05/JAN"],
    ["us", "01/05/2026"],
    ["day", "5"],
    ["ordinal", "5th"],
    ["month", "January"],
    ["year", "2026"],
    ["monthday", "January 5"],
    ["dmy", "5 January 2026"],
    ["dmyc", "5, January, 2026"],
  ];
  it.each(cases)("format %s", (fmt, expected) => {
    expect(formatDate("2026-01-05", fmt)).toBe(expected);
  });

  it("is case-insensitive and handles ordinal suffixes", () => {
    expect(formatDate("2026-12-31", "SHORT")).toBe("31/DEC/2026");
    const ord = (d: string) => formatDate(`2026-01-${d}`, "ordinal");
    expect([ord("01"), ord("02"), ord("03"), ord("11"), ord("12"), ord("13"), ord("21"), ord("22"), ord("23")]).toEqual([
      "1st", "2nd", "3rd", "11th", "12th", "13th", "21st", "22nd", "23rd",
    ]);
  });

  it("returns non-ISO values unchanged", () => {
    expect(formatDate("next Tuesday", "long")).toBe("next Tuesday");
  });
});

describe("prefill", () => {
  it("YY becomes the two-digit UTC year", () => {
    expect(prefillValue(field("{{Case number=YYGJCR00XXX}}"), NOW)).toBe("26GJCR00XXX");
  });

  it("<Label?A=x> takes the code for another field's value", () => {
    const f = field("{{Case number=YYGJ<Division?CRIMINAL DIVISION=CR;CIVIL DIVISION=CC>00XXX}}");
    expect(prefillValue(f, NOW, (l) => (l === "Division" ? "CIVIL DIVISION" : undefined))).toBe("26GJCC00XXX");
    expect(prefillValue(f, NOW, () => "TRAFFIC DIVISION")).toBe("");
    expect(prefillValue(f, NOW)).toBe("");
    expect(prefillDeps(f)).toEqual(["Division"]);
  });

  it("dates: today, today+21 and Label-2", () => {
    expect(prefillValue(field("{{Filed=today:date}}"), NOW)).toBe("2026-03-10");
    expect(prefillValue(field("{{Due=today+21:date}}"), NOW)).toBe("2026-03-31");
    const chained = field("{{Notice=Hearing date-2:date}}");
    expect(prefillValue(chained, NOW, (l) => (l === "Hearing date" ? "2026-03-01" : undefined))).toBe("2026-02-27");
    expect(prefillValue(chained, NOW, () => undefined)).toBe("");
    expect(prefillDeps(chained)).toEqual(["Hearing date"]);
    expect(prefillDeps(field("{{Due=today+21:date}}"))).toEqual([]);
  });

  it("date helpers", () => {
    expect(dateRule("today + 7")).toEqual({ base: "today", days: 7 });
    expect(dateRule("Filing date-3")).toEqual({ base: "Filing date", days: -3 });
    expect(dateRule("today")).toEqual({ base: "today", days: 0 });
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("not a date", 3)).toBe("");
    expect(todayUTC(NOW)).toBe("2026-03-10");
  });

  it("no prefill gives an empty string", () => {
    expect(prefillValue(field("{{Name}}"), NOW)).toBe("");
  });
});

describe("caseNumberPattern", () => {
  const gtaw = SERVERS.gtaw;
  const freestyle = SERVERS.freestyle;
  // Callers (FormView) pass an already server-offset `now` (getServerDate), so the
  // 2-digit year comes from that date; the transform only adds/removes GJ.
  const fsNow = (d: Date) => getServerDate(d, freestyle);

  it("expands YY and keeps/strips GJ per server (static pattern)", () => {
    const f = field("{{Case number=YYGJCR00XXX}}");
    expect(caseNumberPattern(f, NOW, gtaw)).toBe("26GJCR00XXX");
    expect(caseNumberPattern(f, fsNow(NOW), freestyle)).toBe("90CR00XXX");
  });

  it("leaves a no-GJ Supreme pattern unchanged except for the year (edge case)", () => {
    const f = field("{{Case number=YYSCWC00XXX}}");
    expect(caseNumberPattern(f, NOW, gtaw)).toBe("26SCWC00XXX");
    expect(caseNumberPattern(f, fsNow(NOW), freestyle)).toBe("90SCWC00XXX");
  });

  it("uses the first <Division?…> code when no Division is chosen", () => {
    const f = field("{{Case number=YYGJ<Division?CRIMINAL DIVISION=CR;CIVIL DIVISION=CC;TRAFFIC DIVISION=TC;SMALL CLAIMS DIVISION=SM>00XXX}}");
    // No lookup → first code (CR), so the placeholder is never empty.
    expect(caseNumberPattern(f, NOW, gtaw)).toBe("26GJCR00XXX");
    expect(caseNumberPattern(f, fsNow(NOW), freestyle)).toBe("90CR00XXX");
    // A chosen Division wins over the first code.
    const civil = (l: string) => (l === "Division" ? "CIVIL DIVISION" : undefined);
    expect(caseNumberPattern(f, NOW, gtaw, civil)).toBe("26GJCC00XXX");
    expect(caseNumberPattern(f, fsNow(NOW), freestyle, civil)).toBe("90CC00XXX");
    const traffic = () => "TRAFFIC DIVISION";
    expect(caseNumberPattern(f, fsNow(NOW), freestyle, traffic)).toBe("90TC00XXX");
  });

  it("sources the pattern from the prefill, not the (noisy) fallback", () => {
    // Fallback letters/placeholders differ from the prefill; the pattern follows the prefill.
    const f = field("{{Case number=YYGJCR00XXX|##GJCR#####}}");
    expect(caseNumberPattern(f, NOW, gtaw)).toBe("26GJCR00XXX");
    expect(caseNumberPattern(f, fsNow(NOW), freestyle)).toBe("90CR00XXX");
  });

  it("tracks the year across the New-Year rollover (freestyle = year − 36)", () => {
    const f = field("{{Case number=YYGJCR00XXX}}");
    const endOf2026 = new Date("2026-12-31T23:00:00Z");
    expect(caseNumberPattern(f, endOf2026, gtaw)).toBe("26GJCR00XXX");
    expect(caseNumberPattern(f, fsNow(endOf2026), freestyle)).toBe("90CR00XXX");
    const in2027 = new Date("2027-01-01T01:00:00Z");
    expect(caseNumberPattern(f, in2027, gtaw)).toBe("27GJCR00XXX");
    expect(caseNumberPattern(f, fsNow(in2027), freestyle)).toBe("91CR00XXX");
  });

  it("returns '' for a field with no prefill", () => {
    expect(caseNumberPattern(field("{{Case number|__________}}"), NOW, gtaw)).toBe("");
  });
});

describe("token grammar", () => {
  it("parses label, prefill, character, type, options, wrap and fallback", () => {
    const f = field("{{Judge=Hon. X@name:select:A;B:c>strong|<em>JUDGE</em>}}");
    expect(f).toMatchObject({
      label: "Judge",
      prefill: "Hon. X",
      character: "name",
      type: "select",
      options: ["A", "B:c"],
      wrap: "strong",
      fallback: "<em>JUDGE</em>",
    });
    expect(field("{{Body:paras:text-align:justify}}").options).toEqual(["text-align:justify"]);
    expect(field("{{@bar}}").label).toBe("Bar / badge number");
    expect(field("{{@custom}}").label).toBe("custom");
  });

  it("throws the reference errors", () => {
    expect(() => compile("{{X:bogus}}")).toThrow("Unknown field type 'bogus' in {{X:bogus}}");
    expect(() => compile("{{:text}}")).toThrow("Field without a label: {{:text}}");
    expect(() => compile("{{#A}}{{/B}}")).toThrow("{{/B}} closes {{#A}}");
    expect(() => compile("{{#A}}x")).toThrow("Unclosed {{#A}}");
  });

  it("records line numbers and check option text/indent", () => {
    const tree = compile(
      "<p>{{A}} {{B}}</p><p>{{C:check}} &mdash; First option</p><p>&nbsp;&nbsp;&nbsp;{{D:check}} Sub option</p>",
    );
    const fs = fields(tree).map((e) => ("field" in e ? e.field : null));
    expect(fs.map((f) => f?.line)).toEqual([1, 1, 2, 3]);
    expect(fs[2]?.text).toBe("&mdash; First option");
    expect(fs[2]?.indent).toBe(false);
    expect(fs[3]?.text).toBe("Sub option");
    expect(fs[3]?.indent).toBe(true);
  });
});

describe("fields()", () => {
  it("deduplicates shared labels", () => {
    expect(labels(fields(compile("{{A}} {{B}} {{A}}")))).toEqual(["A", "B"]);
  });

  it("keeps outer labels shared inside blocks", () => {
    const entries = fields(compile("{{#Items}}{{Name}} {{Qty}}{{/Items}} {{Name}}"));
    expect(labels(entries)).toEqual(["#Items", "Name"]);
    expect(labels(blockOf(entries, "Items").fields)).toEqual(["Qty"]);
  });

  it("merges same-named blocks (Expungement Charges)", () => {
    const entries = fields(compile(getForm("criminal-expungement")!.html));
    const blocks = entries.filter((e) => "block" in e);
    expect(blocks).toHaveLength(1);
    expect(labels(blockOf(entries, "Charges").fields)).toEqual(["Offense"]);
  });

  it("nests blocks (Order Decree Sections › Sub-points)", () => {
    const entries = fields(compile(getForm("misc-order-decree")!.html));
    const sections = blockOf(entries, "Sections");
    expect(sections.block.count).toBe(2);
    expect(labels(sections.fields)).toEqual(["Section heading", "Section text (optional)", "#Sub-points"]);
    const sub = blockOf(sections.fields, "Sub-points");
    expect(sub.block.count).toBe(0);
    expect(labels(sub.fields)).toEqual(["Sub-point heading", "Sub-point text"]);
  });

  it("emits section markers only at top level", () => {
    const entries = fields(compile("{{-- One}}{{A}}{{#B}}{{-- Inner}}{{C}}{{/B}}"));
    expect(labels(entries)).toEqual(["--One", "A", "#B"]);
  });
});

describe("render()", () => {
  it("renders fallbacks, highlights and escapes", () => {
    const tree = compile("<p>{{Name|<b>NAME</b>}} {{Note}}</p>");
    expect(render(tree, {})).toBe("<p><b>NAME</b> </p>");
    expect(render(tree, {}, { highlight: true })).toBe('<p><mark class="unfilled" title="Name"><b>NAME</b></mark> </p>');
    expect(render(tree, { Name: "<x>&\"" })).toBe("<p>&lt;x&gt;&amp;&quot; </p>");
    expect(escapeHtml("a'b")).toBe("a'b");
  });

  it("conditionals: on by default, |off starts off, values override", () => {
    const tree = compile("{{?Extra}}[on]{{/Extra}}{{?Opt|off}}[opt]{{/Opt}}");
    expect(render(tree, {})).toBe("[on]");
    expect(render(tree, { "?Extra": false, "?Opt": true })).toBe("[opt]");
    const conds = fields(tree).filter((e): e is CondEntry => "cond" in e);
    expect(conds.map((c) => [c.cond.name, c.cond.on])).toEqual([
      ["Extra", true],
      ["Opt", false],
    ]);
  });

  it("$roman after Sections follows the item count", () => {
    const tree = compile("{{#Sections|2}}{{$roman}}. {{/Sections}}{{$roman after Sections}}.");
    expect(render(tree, {})).toBe("I. II. III.");
    expect(render(tree, { "#Sections": defaultItems(3) })).toBe("I. II. III. IV.");
    expect(render(tree, { "#Sections": [] })).toBe("I.");
  });

  it("positions and nested block scopes", () => {
    const tree = compile("{{#Outer|2}}{{$letter}}:{{Who}}[{{#Inner}}{{$word}}{{Who}}{{/Inner}}]{{/Outer}}");
    const out = render(tree, { "#Outer": [{ Who: "a", "#Inner": [{}, { Who: "z" }] }, {}] });
    expect(out).toBe("A:a[OneaTwoz]B:[One]");
  });

  it("renders each field type", () => {
    const r = (token: string, v: string | boolean) => render(compile(token), { X: v });
    expect(r("{{X:check}}", true)).toBe("[X]");
    expect(r("{{X:check:Yes;No}}", false)).toBe("No");
    expect(r("{{X:date:short}}", "2026-01-05")).toBe("05/JAN/2026");
    expect(r("{{X:textarea}}", "a\nhttps://e.com/p.png\nhttps://e.com")).toBe(
      'a<br /><img src="https://e.com/p.png" alt="" /><br /><a href="https://e.com">https://e.com</a>',
    );
    expect(r("{{X:paras:text-align:justify}}", "one\n\n two ")).toBe(
      '<p style="text-align:justify">one</p>\n<p style="text-align:justify">two</p>',
    );
    expect(r("{{X:list:b}}", "a\n\nb")).toBe("<li><b>a</b></li>\n<li><b>b</b></li>");
    expect(r("{{X:spoiler}}", "a\n\nb")).toContain('<div class="ipsSpoiler_contents"><p>a</p><p>&nbsp;</p><p>b</p></div>');
    expect(r("{{X:image}}", "javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(r("{{X:url}}", " https://e.com ")).toBe('<a href="https://e.com">https://e.com</a>');
    expect(r("{{X:text:upper}}", "abc")).toBe("ABC");
    expect(r("{{X>li}}", "abc")).toBe("<li>abc</li>");
  });
});

describe("plain()", () => {
  it("drops tags without spaces, decodes entities, collapses whitespace, caps at 160", () => {
    expect(plain("a<br>b")).toBe("ab");
    expect(plain("&nbsp;x &amp; y &lt;&gt; &quot;&#39;&apos; &#65;&#x42;&#x110000;")).toBe(`x & y <> "'' AB&#x110000;`);
    expect(plain("  a \n\t\u00a0 b  ")).toBe("a b");
    expect(plain("<p>" + "z".repeat(200) + "</p>")).toHaveLength(160);
  });
});

describe("all forms", () => {
  it.each(ALL_FORMS.map((f) => [f.id, f.html]))("%s compiles", (_id, html) => {
    const tree = compile(html);
    expect(fields(tree).length).toBeGreaterThan(0);
    expect(render(tree, {})).toBeTruthy();
  });
});
