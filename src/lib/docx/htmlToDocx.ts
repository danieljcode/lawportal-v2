// Final preview HTML → .docx (server only; design §.docx route).
//
// Walks the node-html-parser tree with a paragraph accumulator: inline output
// (text, styled runs, links, breaks, image links) collects into the current
// paragraph, and block elements flush it and start fresh. Tables become real
// Word tables (each cell walked with its own accumulator), bordered divs become
// bordered paragraphs, and only http(s) links/images become hyperlinks.
// node-html-parser exposes only the raw `style` attribute, so styles are read
// through the small pure helpers exported below.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { HTMLElement, parse, TextNode, type Node } from "node-html-parser";
import { toHex } from "../bbcode";

type Alignment = (typeof AlignmentType)[keyof typeof AlignmentType];
type BorderStyleValue = (typeof BorderStyle)[keyof typeof BorderStyle];

export interface Border {
  style: BorderStyleValue;
  size: number;
  color: string;
}

export interface CellBorders {
  top: Border;
  right: Border;
  bottom: Border;
  left: Border;
}

/* ---------- pure helpers ---------- */

/** `a:b; c:d` → `{a:"b", c:"d"}` (keys lowercased; empty keys or values skipped). */
export function parseStyle(attr?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (attr || "").split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/** A CSS colour as Word's 6-digit hex (`FF0000`), or undefined for named colours and malformed values. */
export function toDocxColor(v?: string): string | undefined {
  if (!v) return undefined;
  let hex = toHex(v.trim());
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1).toUpperCase() : undefined;
}

/** The colour of a CSS border value (its last hex/rgb token), defaulting to black. */
export function borderColor(v: string): string {
  const tokens = v.replace(/\(([^)]*)\)/g, (m) => m.replace(/\s+/g, "")).split(/\s+/);
  const token = tokens.filter((t) => /^(#|rgba?\()/i.test(t)).pop();
  return (token && toDocxColor(token)) || "000000";
}

/** `20px` → 30 half-points; anything that isn't a plain px value → undefined. */
export function pxToHalfPoints(v: string): number | undefined {
  const m = /^(\d+(\.\d+)?)px$/.exec(v.trim());
  return m ? Math.round(Number(m[1]) * 1.5) : undefined;
}

const NO_BORDER: Border = Object.freeze({ style: BorderStyle.NONE, size: 0, color: "auto" });

const isNone = (v: string) => /^none\b/i.test(v.trim());
const line = (v: string): Border => ({ style: BorderStyle.SINGLE, size: 4, color: borderColor(v) });

/**
 * A cell's four borders: the table's `border` attribute (≥ 1 → black lines),
 * then the cell's `border` key, then each `border-<side>` key in style order
 * (`none` clears that side).
 */
export function cellBorders(style: Record<string, string>, tableBorder: number): CellBorders {
  const base: Border = tableBorder >= 1 ? { style: BorderStyle.SINGLE, size: 4, color: "000000" } : NO_BORDER;
  const out: CellBorders = { top: base, right: base, bottom: base, left: base };
  if (style.border !== undefined) {
    const b = isNone(style.border) ? NO_BORDER : line(style.border);
    out.top = out.right = out.bottom = out.left = b;
  }
  for (const [key, value] of Object.entries(style)) {
    const m = /^border-(top|right|bottom|left)$/.exec(key);
    if (m) out[m[1] as keyof CellBorders] = isNone(value) ? NO_BORDER : line(value);
  }
  return out;
}

/* ---------- walker ---------- */

interface RunProps {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  size?: number;
  color?: string;
  shading?: { type: typeof ShadingType.CLEAR; color: string; fill: string };
  font?: string;
}

interface Ctx {
  run: RunProps;
  alignment?: Alignment;
  boxed: Border | null;
  indent?: number;
  /** http(s) target while inside a link. */
  link?: string;
}

type RunSpec = { text: string; brk?: boolean; props: RunProps; link?: string };

interface Pending {
  runs: RunSpec[];
  alignment?: Alignment;
  boxed: Border | null;
  indent?: number;
}

const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "li", "table", "hr", "ul", "ol", "blockquote"]);
const SKIP = new Set(["script", "style", "head", "title"]);
const FONT_SIZES = [16, 20, 24, 28, 36, 48, 72]; // <font size=1..7> in half-points
const HTTP = /^https?:\/\//i;
const LINK_COLOR = "0563C1";
const LIST_INDENT = 360;
// Characters Word's XML can't hold.
const BAD_XML_CHARS = /[\u0000-\u0008\u000b\u000e-\u001f\ufffe\uffff]/g;

const tagOf = (el: HTMLElement) => (el.rawTagName || "").toLowerCase();

function alignmentOf(el: HTMLElement, style: Record<string, string>): Alignment | undefined {
  const v = (style["text-align"] || el.getAttribute("align") || "").trim().toLowerCase();
  if (v === "center") return AlignmentType.CENTER;
  if (v === "right") return AlignmentType.RIGHT;
  if (v === "justify") return AlignmentType.JUSTIFIED;
  if (v === "left") return AlignmentType.LEFT;
  return undefined;
}

function boxOf(style: Record<string, string>): Border | null {
  for (const [key, value] of Object.entries(style)) {
    if (/^border(-(top|right|bottom|left))?$/.test(key) && !isNone(value)) {
      return { style: BorderStyle.SINGLE, size: 4, color: borderColor(value) };
    }
  }
  return null;
}

/** Run properties of `el` on top of the inherited ones. */
function runPropsOf(el: HTMLElement, tag: string, style: Record<string, string>, base: RunProps): RunProps {
  const p: RunProps = { ...base };
  if (tag === "strong" || tag === "b" || tag === "th" || /^h[1-4]$/.test(tag)) p.bold = true;
  if (tag === "em" || tag === "i") p.italics = true;
  if (tag === "u") p.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") p.strike = true;
  if (tag === "font") {
    const n = Number(el.getAttribute("size"));
    if (Number.isInteger(n) && n >= 1 && n <= 7) p.size = FONT_SIZES[n - 1];
  }
  if (style["font-size"]) {
    const size = pxToHalfPoints(style["font-size"]);
    if (size) p.size = size;
  }
  const color = toDocxColor(style.color);
  if (color) p.color = color;
  const fill = toDocxColor(style["background-color"] || style.background);
  if (fill) p.shading = { type: ShadingType.CLEAR, color: "auto", fill };
  if (style["font-family"]) {
    const font = style["font-family"].split(",")[0].replace(/["']/g, "").trim();
    if (font) p.font = font;
  }
  return p;
}

function textRun(spec: RunSpec): TextRun {
  const p = spec.props;
  return new TextRun({
    text: spec.brk ? undefined : spec.text,
    break: spec.brk ? 1 : undefined,
    bold: p.bold,
    italics: p.italics,
    underline: p.underline ? {} : undefined,
    strike: p.strike,
    size: p.size,
    color: p.color,
    shading: p.shading,
    font: p.font,
  });
}

class Walker {
  readonly out: Array<Paragraph | Table> = [];
  private current: Pending | null = null;

  private open(ctx: Ctx): Pending {
    if (!this.current) this.current = { runs: [], alignment: ctx.alignment, boxed: ctx.boxed, indent: ctx.indent };
    return this.current;
  }

  private inline(ctx: Ctx, text: string, brk = false): void {
    const spec: RunSpec = { text, brk, props: ctx.run };
    if (ctx.link) {
      spec.link = ctx.link;
      spec.props = { ...ctx.run, color: LINK_COLOR, underline: true };
    }
    this.open(ctx).runs.push(spec);
  }

  /** Emit the pending paragraph (dropped when it has no content). */
  flush(): void {
    const cur = this.current;
    this.current = null;
    if (!cur) return;
    const runs = cur.runs;
    // Trim the paragraph's trailing whitespace.
    for (let i = runs.length - 1; i >= 0 && !runs[i].brk; i--) {
      runs[i] = { ...runs[i], text: runs[i].text.replace(/[ \t\n\r\f]+$/, "") };
      if (runs[i].text) break;
    }
    const kept = runs.filter((r) => r.brk || r.text);
    if (!kept.length) return;
    const children: Array<TextRun | ExternalHyperlink> = [];
    for (let i = 0; i < kept.length;) {
      const link = kept[i].link;
      if (!link) {
        children.push(textRun(kept[i++]));
        continue;
      }
      const group: TextRun[] = [];
      while (i < kept.length && kept[i].link === link) group.push(textRun(kept[i++]));
      children.push(new ExternalHyperlink({ link, children: group }));
    }
    this.out.push(this.paragraph(cur, children));
  }

  private paragraph(
    p: Omit<Pending, "runs">,
    children: Array<TextRun | ExternalHyperlink>,
    extra: { bottomOnly?: boolean } = {},
  ) {
    const b = p.boxed;
    return new Paragraph({
      children,
      alignment: p.alignment,
      indent: p.indent ? { left: p.indent } : undefined,
      border: extra.bottomOnly
        ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } }
        : b
          ? { top: b, right: b, bottom: b, left: b }
          : undefined,
    });
  }

  children(el: HTMLElement, ctx: Ctx): void {
    for (const child of el.childNodes) this.node(child, ctx);
  }

  private node(node: Node, ctx: Ctx): void {
    if (node instanceof TextNode) {
      this.text(node, ctx);
      return;
    }
    if (node instanceof HTMLElement) this.element(node, ctx);
  }

  private text(node: TextNode, ctx: Ctx): void {
    let text = node.text.replace(BAD_XML_CHARS, "").replace(/[ \t\n\r\f]+/g, " ");
    if (!this.current || !this.current.runs.some((r) => r.brk || r.text)) {
      // Start of a paragraph: leading whitespace (and whitespace between blocks) is dropped.
      text = text.replace(/^ /, "");
      if (!text) return;
    }
    if (text) this.inline(ctx, text);
  }

  private element(el: HTMLElement, ctx: Ctx): void {
    const tag = tagOf(el);
    if (SKIP.has(tag)) return;
    if (el.classList.contains("ipsSpoiler_header")) return;
    const style = parseStyle(el.getAttribute("style"));
    const run = runPropsOf(el, tag, style, ctx.run);

    if (tag === "br") {
      this.inline(ctx, "", true);
      return;
    }
    if (tag === "img") {
      const src = (el.getAttribute("src") || "").trim();
      if (HTTP.test(src)) this.inline({ ...ctx, link: src }, `[Image: ${src}]`);
      else this.inline(ctx, "[Image]");
      return;
    }
    if (tag === "a") {
      const href = (el.getAttribute("href") || "").trim();
      this.children(el, { ...ctx, run, link: HTTP.test(href) ? href : ctx.link });
      return;
    }
    if (!BLOCK.has(tag)) {
      this.children(el, { ...ctx, run });
      return;
    }

    // Block elements: flush, emit own content, flush again.
    this.flush();
    if (tag === "hr") {
      this.out.push(this.paragraph({ alignment: ctx.alignment, boxed: null }, [], { bottomOnly: true }));
      return;
    }
    if (tag === "table") {
      const table = this.table(el, { ...ctx, run });
      if (table) this.out.push(table);
      return;
    }
    const inner: Ctx = { ...ctx, run, alignment: alignmentOf(el, style) ?? ctx.alignment };
    if (tag === "div") {
      const box = boxOf(style);
      if (box) inner.boxed = box;
      if (el.classList.contains("ipsSpoiler")) {
        this.inline({ ...inner, run: { ...inner.run, bold: true } }, "Spoiler");
        this.flush();
      }
    }
    if (tag === "ul" || tag === "ol") {
      let n = 0;
      for (const child of el.childNodes) {
        if (child instanceof HTMLElement && tagOf(child) === "li") {
          n++;
          this.listItem(child, inner, tag === "ol" ? `${n}. ` : "• ");
        } else this.node(child, inner);
      }
      this.flush();
      return;
    }
    if (tag === "li") {
      this.listItem(el, ctx, "• ");
      return;
    }
    this.children(el, inner);
    this.flush();
  }

  private listItem(li: HTMLElement, ctx: Ctx, prefix: string): void {
    this.flush();
    const style = parseStyle(li.getAttribute("style"));
    const inner: Ctx = {
      ...ctx,
      run: runPropsOf(li, "li", style, ctx.run),
      alignment: alignmentOf(li, style) ?? ctx.alignment,
      indent: (ctx.indent || 0) + LIST_INDENT,
    };
    this.inline(inner, prefix);
    this.children(li, inner);
    this.flush();
  }

  private table(el: HTMLElement, ctx: Ctx): Table | null {
    const tableBorder = Number(el.getAttribute("border")) || 0;
    const rows: TableRow[] = [];
    const trs: HTMLElement[] = [];
    for (const child of el.childNodes) {
      if (!(child instanceof HTMLElement)) continue;
      const t = tagOf(child);
      if (t === "tr") trs.push(child);
      else if (t === "tbody" || t === "thead" || t === "tfoot") {
        for (const tr of child.childNodes) if (tr instanceof HTMLElement && tagOf(tr) === "tr") trs.push(tr);
      }
    }
    for (const tr of trs) {
      const cells: TableCell[] = [];
      for (const td of tr.childNodes) {
        if (!(td instanceof HTMLElement)) continue;
        const t = tagOf(td);
        if (t !== "td" && t !== "th") continue;
        cells.push(this.cell(td, t, ctx, tableBorder));
      }
      if (cells.length) rows.push(new TableRow({ children: cells }));
    }
    if (!rows.length) return null;
    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: NO_BORDER,
        right: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
    });
  }

  private cell(td: HTMLElement, tag: string, ctx: Ctx, tableBorder: number): TableCell {
    const style = parseStyle(td.getAttribute("style"));
    // R5: the cell's own text-align / align is the inherited alignment of its content.
    const inner: Ctx = {
      ...ctx,
      run: runPropsOf(td, tag, style, ctx.run),
      alignment: alignmentOf(td, style) ?? ctx.alignment,
    };
    const w = new Walker();
    w.children(td, inner);
    w.flush();
    const children = w.out.slice();
    // Word needs a paragraph in every cell, and as the last element of a cell.
    if (!children.length || children[children.length - 1] instanceof Table) children.push(new Paragraph(""));
    return new TableCell({ children, borders: cellBorders(style, tableBorder) });
  }
}

/** Convert final preview HTML to a .docx file (1-inch margins, document title `title`). */
export async function htmlToDocx(html: string, title: string): Promise<Buffer> {
  const root = parse(html, { blockTextElements: { script: false, style: false } });
  const walker = new Walker();
  walker.children(root, { run: {}, boxed: null });
  walker.flush();
  const children = walker.out.length ? walker.out : [new Paragraph("")];
  const doc = new Document({
    title,
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
