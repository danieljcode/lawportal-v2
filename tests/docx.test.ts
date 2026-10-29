// .docx converter and route (AC 21 unit parts, design §Testing docx cases, R5).
import { BorderStyle } from "docx";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/docx/route";
import { resetLimits } from "@/lib/server/rateLimit";
import { ALL_FORMS, getForm } from "@/data";
import { borderColor, cellBorders, htmlToDocx, parseStyle, pxToHalfPoints, toDocxColor } from "@/lib/docx/htmlToDocx";
import { compile, fields, render } from "@/lib/template";
import { fixture } from "./fixtures";
import { readZip, readZipText } from "./zip";

const SINGLE = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" };

function finalHtml(id: string, variant?: "A"): string {
  const form = getForm(id);
  if (!form) throw new Error("no form " + id);
  const tree = compile(form.html);
  return render(tree, variant ? fixture(fields(tree), variant) : {});
}

async function documentXml(html: string): Promise<string> {
  return readZipText(await htmlToDocx(html, "Test"), "word/document.xml");
}

describe("htmlToDocx", () => {
  it("builds a .docx zip for the civil complaint", async () => {
    const buf = await htmlToDocx(finalHtml("civil-complaint"), "Civil Complaint");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
    expect(buf.length).toBeGreaterThan(2048);
    expect(buf.includes("word/document.xml", 0, "latin1")).toBe(true);
    const zip = readZip(buf);
    expect(zip.has("word/document.xml")).toBe(true);
    expect(zip.get("docProps/core.xml")?.toString("utf8")).toContain("<dc:title>Civil Complaint</dc:title>");
    const xml = zip.get("word/document.xml")!.toString("utf8");
    expect(xml).toContain("<w:tbl>"); // table layouts stay tables
    expect(xml).toContain('w:top="1440"'); // 1-inch margins
  });

  it(`converts all ${ALL_FORMS.length} forms, empty and with fixture A`, { timeout: 120_000 }, async () => {
    expect(ALL_FORMS).toHaveLength(52);
    for (const form of ALL_FORMS) {
      const tree = compile(form.html);
      for (const values of [{}, fixture(fields(tree), "A")]) {
        const buf = await htmlToDocx(render(tree, values), form.title);
        expect(buf.subarray(0, 2).toString("latin1"), form.id).toBe("PK");
      }
    }
  });

  it("R5: a right-aligned td gives its paragraphs right alignment", async () => {
    const xml = await documentXml('<table><tr><td style="text-align:right">x</td></tr></table>');
    expect(xml).toContain('<w:jc w:val="right"/>');
    // align attribute too, and a child block's own alignment wins
    const xml2 = await documentXml('<table><tr><td align="center">a<p style="text-align:left">b</p></td></tr></table>');
    expect(xml2).toContain('<w:jc w:val="center"/>');
    expect(xml2).toContain('<w:jc w:val="left"/>');
  });

  it("keeps bold, size, colour, shading and font as run properties", async () => {
    const xml = await documentXml(
      '<p style="font-size:20px"><strong>B</strong> <span style="color:#ff0000;background-color:#ffff99;font-family:\'Times New Roman\', serif">C</span> <em>I</em> <u>U</u> <s>S</s></p>',
    );
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain('<w:sz w:val="30"/>');
    expect(xml).toContain('<w:color w:val="FF0000"/>');
    expect(xml).toMatch(/<w:shd [^>]*w:fill="FFFF99"/);
    expect(xml).toContain('w:ascii="Times New Roman"');
    expect(xml).toContain("<w:i/>");
    expect(xml).toMatch(/<w:u w:val="single"\/>/);
    expect(xml).toContain("<w:strike/>");
  });

  it("decodes entities, collapses whitespace and drops script content", async () => {
    const xml = await documentXml("<p>A &amp; B&nbsp;&lt;c&gt;\n   d</p><script>alert(1)</script><style>p{}</style>");
    expect(xml).toContain("A &amp; B\u00a0&lt;c&gt; d");
    expect(xml).not.toContain("alert");
    expect(xml).not.toContain("p{}");
  });

  it("turns http(s) images and links into hyperlinks, and others into plain text", async () => {
    const buf = await htmlToDocx(
      '<p><img src="https://example.com/seal.png"> <img src="data:image/png;base64,AA"> <a href="https://example.com/x">site</a> <a href="javascript:alert(1)">bad</a></p>',
      "T",
    );
    const zip = readZip(buf);
    const xml = zip.get("word/document.xml")!.toString("utf8");
    const rels = zip.get("word/_rels/document.xml.rels")!.toString("utf8");
    expect(xml).toContain("[Image: https://example.com/seal.png]");
    expect(xml).toContain("[Image]");
    expect(xml.match(/<w:hyperlink /g)).toHaveLength(2);
    expect(rels).toContain('Target="https://example.com/seal.png"');
    expect(rels).toContain('Target="https://example.com/x"');
    expect(rels).not.toContain("javascript:");
    expect(xml).toContain(">bad<");
  });

  it("bordered divs become bordered paragraphs; hr is a bottom border", async () => {
    const xml = await documentXml('<div style="border:1px solid #000000;padding:15px"><p>one</p><p>two</p></div><hr>');
    const boxed = xml.match(/<w:pBdr><w:top [^>]*\/><w:left [^>]*\/><w:bottom [^>]*\/><w:right [^>]*\/><\/w:pBdr>/g);
    expect(boxed).toHaveLength(2);
    expect(xml).toMatch(/<w:pBdr><w:bottom w:val="single"[^>]*\/><\/w:pBdr>/);
  });

  it("renders spoilers as a bold Spoiler line without the header text", async () => {
    const xml = await documentXml(
      '<div class="ipsSpoiler" data-ipsspoiler=""><div class="ipsSpoiler_header"><span>Header text</span></div><div class="ipsSpoiler_contents"><p>Inside</p></div></div>',
    );
    expect(xml).toContain(">Spoiler<");
    expect(xml).toContain(">Inside<");
    expect(xml).not.toContain("Header text");
  });

  it("numbers ordered lists and bullets unordered ones", async () => {
    const xml = await documentXml("<ol><li>a</li><li>b</li></ol><ul><li>c</li></ul>");
    expect(xml).toContain("1. ");
    expect(xml).toContain("2. ");
    expect(xml).toContain("• ");
    expect(xml).toContain('w:left="360"');
  });

  it("keeps the criminal-record form's cell borders", async () => {
    const xml = await documentXml(finalHtml("misc-certificate-of-criminal-record"));
    expect(xml).toContain(
      '<w:tcBorders><w:top w:val="none" w:color="auto" w:sz="0"/><w:left w:val="none" w:color="auto" w:sz="0"/>' +
        '<w:bottom w:val="single" w:color="000000" w:sz="4"/><w:right w:val="single" w:color="000000" w:sz="4"/></w:tcBorders>',
    );
  });

  it("puts nested tables inside cells and ends every cell with a paragraph", async () => {
    const xml = await documentXml("<table><tr><td><table><tr><td>in</td></tr></table></td><td></td></tr></table>");
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    // The nested table is followed by a paragraph inside its cell, and the empty cell has one too.
    expect(xml).toMatch(/<\/w:tbl><w:p[ >/]/);
    expect(xml).toMatch(/<\/w:tcPr><w:p[ >/]/);
  });
});

describe("docx pure helpers", () => {
  it("parseStyle", () => {
    expect(parseStyle("Font-Size: 14px ; color:#000;;bad; :x; y: ;background:url(a:b)")).toEqual({
      "font-size": "14px",
      color: "#000",
      background: "url(a:b)",
    });
    expect(parseStyle(undefined)).toEqual({});
  });

  it("toDocxColor", () => {
    expect(toDocxColor("#abc")).toBe("AABBCC");
    expect(toDocxColor("#000000")).toBe("000000");
    expect(toDocxColor("rgb(0,0,0)")).toBe("000000");
    expect(toDocxColor("rgb(255, 0, 16)")).toBe("FF0010");
    expect(toDocxColor("red")).toBeUndefined();
    expect(toDocxColor("#12345")).toBeUndefined();
    expect(toDocxColor(undefined)).toBeUndefined();
  });

  it("borderColor", () => {
    expect(borderColor("1px solid #ff0000")).toBe("FF0000");
    expect(borderColor("1px solid rgb(0, 0, 0)")).toBe("000000");
    expect(borderColor("1pt solid")).toBe("000000");
    expect(borderColor("1px solid red")).toBe("000000");
  });

  it("pxToHalfPoints", () => {
    expect(pxToHalfPoints("20px")).toBe(30);
    expect(pxToHalfPoints("13px")).toBe(20);
    expect(pxToHalfPoints("1.2em")).toBeUndefined();
    expect(pxToHalfPoints("12pt")).toBeUndefined();
  });

  it("cellBorders for the criminal-record cell style", () => {
    const style = "border-bottom:1pt solid;border-left:none;border-right:1pt solid;border-top:none;padding:0in 5.4pt";
    expect(cellBorders(parseStyle(style), 0)).toEqual({ top: NONE, right: SINGLE, bottom: SINGLE, left: NONE });
  });

  it("cellBorders: table border, border then side keys", () => {
    expect(cellBorders({}, 0)).toEqual({ top: NONE, right: NONE, bottom: NONE, left: NONE });
    expect(cellBorders({}, 1)).toEqual({ top: SINGLE, right: SINGLE, bottom: SINGLE, left: SINGLE });
    const red = { ...SINGLE, color: "FF0000" };
    expect(cellBorders({ "border-top": "none", border: "1px solid #ff0000" }, 0)).toEqual({
      top: NONE,
      right: red,
      bottom: red,
      left: red,
    });
  });
});

describe("POST /api/docx", () => {
  const URL = "http://localhost:3000/api/docx";
  const post = (body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }, url = URL) =>
    POST(new Request(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));

  beforeEach(() => resetLimits());

  it("answers 429 after 30 requests a minute from one IP, and counts each IP apart", async () => {
    const from = (ip: string) => ({ "Content-Type": "application/json", "X-Forwarded-For": ip });
    for (let i = 0; i < 30; i++) expect((await post({}, from("10.0.0.1"))).status).toBe(400);
    const res = await post({ html: "<p>x</p>" }, from("10.0.0.1"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post({ html: "<p>x</p>" }, from("10.0.0.2"))).status).toBe(200);
  });

  it("returns the document with download headers", async () => {
    const res = await post({ html: finalHtml("civil-complaint"), title: "Civil Complaint", id: "civil-complaint" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="civil-complaint.docx"');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
  });

  it("names the file from the title when the id is missing or invalid", async () => {
    const res = await post({ html: "<p>x</p>", title: "Motion to Dismiss!", id: "../evil" });
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="motion-to-dismiss.docx"');
    const res2 = await post({ html: "<p>x</p>", title: "x".repeat(201) });
    expect(res2.headers.get("content-disposition")).toBe('attachment; filename="document.docx"');
    const res3 = await post({ html: "<p>x</p>", title: "!!!" });
    expect(res3.headers.get("content-disposition")).toBe('attachment; filename="document.docx"');
  });

  it("validates the request in the design's order", async () => {
    const r415 = await post({ html: "<p>x</p>" }, {});
    expect(r415.status).toBe(415);
    expect(await r415.json()).toEqual({ error: "Expected application/json." });

    const r413 = await post({ html: "x".repeat(2_100_000) });
    expect(r413.status).toBe(413);
    expect(await r413.json()).toEqual({ error: "That document is too large to convert (max 2 MB)." });

    for (const bad of ["{nope", "[]", "null", "3"]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid JSON." });
    }
    for (const bad of [{}, { html: "" }, { html: 3 }, { html: "x".repeat(1_500_001) }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing html." });
    }
  });

  it("refuses foreign hosts with 421", async () => {
    const prev = process.env.LAWAPP_ALLOW_LAN;
    delete process.env.LAWAPP_ALLOW_LAN;
    try {
      const res = await post(
        { html: "<p>x</p>" },
        { "Content-Type": "application/json" },
        "http://evil.example:3000/api/docx",
      );
      expect(res.status).toBe(421);
    } finally {
      if (prev !== undefined) process.env.LAWAPP_ALLOW_LAN = prev;
    }
  });
});
