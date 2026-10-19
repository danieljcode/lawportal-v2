// HTML → Discord markdown for pasting into a Discord message.
//
// The engine's final HTML is converted into a small line-based IR (DiscordDoc)
// and then serialized. Inline formatting lives on runs and never crosses a line,
// so the splitter (discordSplit.ts) can cut anywhere between runs and still
// produce balanced spans. Every HTML text node is escaped: in the final HTML,
// the template's intended formatting lives only in tags, which map to markdown.
// Client-only by default (DOMParser); tests pass a jsdom parser.

import type { HtmlParser } from "./bbcode";

export type TablesMode = "code" | "lines";
export type Mark = "b" | "i" | "u" | "s" | "spoiler";

export const MARKERS: Record<Mark, string> = { b: "**", i: "*", u: "__", s: "~~", spoiler: "||" };

/** The horizontal rule, used for `<hr>` and the edges of bordered boxes. */
export const RULE = "─".repeat(20);

/** text is final markdown: escaped for plain text runs, raw for atoms (links, image URLs, inline code). */
export interface Run {
  text: string;
  marks: Mark[];
  atom?: boolean;
  px?: number;
}

export type DLine =
  | { kind: "text"; prefix: string; runs: Run[] }
  | { kind: "blank" }
  | { kind: "rule" }
  | { kind: "code"; lang: string; lines: string[] };

export interface DiscordDoc {
  lines: DLine[];
}

export interface DiscordOptions {
  /** How grid tables (the court caption) are rendered. Default "code". */
  tables?: TablesMode;
  parser?: HtmlParser;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const URL_RE = /^https?:\/\/[^\s<>"]+$/i;
/** Widest code-block column; longer cell lines wrap. */
const COL_MAX = 40;
/** A table cell with more plain text than this can't live in a fixed-width column. */
const GRID_CELL_MAX = 400;
/** Longest line (in markdown chars) that still becomes a `#`/`##`/`###` heading. */
const HEADING_MAX = 100;
const FENCE = "```";
const SAFE_FENCE = "ˋˋˋ";

/* ---------------------------------------------------------------- escaping */

/** Backslash-escape markdown in plain text; defuse mass mentions and `<…>` tokens. */
export function escapeMarkdown(s: string): string {
  return s
    .replace(/[\\*_~|`<]/g, "\\$&")
    .replace(/\]\(/g, "]\\(")
    .replace(/@(everyone|here)/gi, "@\u200b$1");
}

/** Escape a line start that Discord would read as a heading, quote or list. */
function escapeLineStart(s: string): string {
  if (/^\d+\. /.test(s)) return s.replace(/^(\d+)\. /, "$1\\. ");
  if (/^(#|>|-#|[-+] )/.test(s)) return "\\" + s;
  return s;
}

/* ------------------------------------------------------------- serializing */

function splitWs(text: string): [string, string, string] {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
  return [m[1], m[2], m[3]];
}

/**
 * Runs → one line of markdown. Spans open and close around the runs that carry
 * them, whitespace stays outside the markers, no empty spans, and everything is
 * closed at the end.
 */
export function serializeRuns(runs: Run[]): string {
  let out = "";
  let open: Mark[] = [];
  let pendingWs = "";
  for (const run of runs) {
    if (!run.atom && /^\s*$/.test(run.text)) {
      pendingWs += run.text;
      continue;
    }
    const marks = run.marks;
    let k = 0;
    while (k < open.length && k < marks.length && open[k] === marks[k]) k++;
    const closers = open
      .slice(k)
      .reverse()
      .map((m) => MARKERS[m])
      .join("");
    out += closers;
    const [lead, core, trail] = run.atom ? ["", run.text, ""] : splitWs(run.text);
    const ws = pendingWs + lead;
    out += ws;
    pendingWs = "";
    const openers = marks
      .slice(k)
      .map((m) => MARKERS[m])
      .join("");
    // `**a**` + `*b*` would read as `***`: keep same-char markers apart.
    if (closers && openers && !ws && closers[closers.length - 1] === openers[0]) out += "\u200b";
    out += openers + core;
    open = marks.slice();
    pendingWs = trail;
  }
  out += open
    .slice()
    .reverse()
    .map((m) => MARKERS[m])
    .join("");
  return out.trimEnd();
}

/** One IR line as markdown. A code line is the whole fenced block. */
export function serializeLine(line: DLine): string {
  switch (line.kind) {
    case "blank":
      return "";
    case "rule":
      return RULE;
    case "code":
      return FENCE + line.lang + "\n" + line.lines.join("\n") + "\n" + FENCE;
    case "text":
      return line.prefix + escapeLineStart(serializeRuns(line.runs));
  }
}

/* ------------------------------------------------------------------ helpers */

function styleAttr(el: Element): string {
  return el.getAttribute("style") || "";
}

/** Inline font-size in px, or null. */
function fontPx(el: Element): number | null {
  const m = /(?:^|;)\s*font-size\s*:\s*([\d.]+)\s*(px|pt)?/i.exec(styleAttr(el));
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] && m[2].toLowerCase() === "pt" ? (n * 4) / 3 : n;
}

/** A div with a visible inline border (the forum's boxed sections). */
function isBordered(el: Element): boolean {
  const re = /(?:^|;)\s*border(?:-(?:top|right|bottom|left))?\s*:\s*([^;]*)/gi;
  const style = styleAttr(el);
  for (let m = re.exec(style); m; m = re.exec(style)) {
    const v = m[1].trim().toLowerCase();
    if (v && !/^(none|0|0px|hidden)\b/.test(v)) return true;
  }
  return false;
}

function classOf(el: Element): string {
  const c = el.getAttribute("class");
  return c || "";
}

function plainText(el: Node): string {
  return (el.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heading prefix for an effective font size. */
export function headingFor(px: number | null | undefined): string {
  if (px === null || px === undefined) return "";
  if (px >= 24) return "# ";
  if (px >= 19) return "## ";
  if (px >= 16) return "### ";
  if (px <= 12) return "-# ";
  return "";
}

const H_PX: Record<string, number> = { h1: 28, h2: 22, h3: 18, h4: 16 };

function elementChildren(el: Element): Element[] {
  return Array.from(el.children);
}

function rowsOf(table: Element): Element[] {
  const rows: Element[] = [];
  for (const c of elementChildren(table)) {
    const t = c.tagName.toLowerCase();
    if (t === "tr") rows.push(c);
    else if (t === "tbody" || t === "thead" || t === "tfoot") {
      for (const r of elementChildren(c)) if (r.tagName.toLowerCase() === "tr") rows.push(r);
    }
  }
  return rows;
}

function cellsOf(row: Element): Element[] {
  return elementChildren(row).filter((c) => /^t[dh]$/i.test(c.tagName));
}

/** A cell with text. Images don't count: a seal next to a heading is layout, not a grid column. */
function cellNonEmpty(cell: Element): boolean {
  return plainText(cell) !== "";
}

/** Only the caption's `)` decoration column (or nothing). */
function decorationOnly(cell: Element): boolean {
  return cell.querySelector("img") === null && /^[\s)]*$/.test(plainText(cell));
}

/** A real grid: some row has 2+ filled cells, and no cell holds long prose. */
function isGrid(table: Element): boolean {
  const rows = rowsOf(table);
  if (!rows.some((r) => cellsOf(r).filter(cellNonEmpty).length >= 2)) return false;
  return rows.every((r) => cellsOf(r).every((c) => plainText(c).length <= GRID_CELL_MAX));
}

/* ------------------------------------------------------------ line builder */

class Builder {
  lines: DLine[] = [];
  private cur: { prefix: string; runs: Run[] } | null = null;
  /** A list marker waiting for the item's first line. */
  nextPrefix: string | null = null;

  text(run: Run, base: string, startsLine: boolean): void {
    if (!this.cur) {
      if (!startsLine) return;
      this.cur = { prefix: this.nextPrefix ?? base, runs: [] };
      this.nextPrefix = null;
    }
    this.cur.runs.push(run);
  }

  finish(): void {
    const cur = this.cur;
    if (!cur) return;
    this.cur = null;
    const runs = trimRuns(cur.runs);
    if (!runs.length) {
      this.lines.push({ kind: "blank" });
      return;
    }
    let prefix = cur.prefix;
    if (prefix === "" || prefix === "> ") {
      const h = headingFor(runs[0].px);
      // Some forms set whole paragraphs at heading sizes: long lines stay body text.
      const len = runs.reduce((n, r) => n + r.text.length, 0);
      if (h === "-# " || len <= HEADING_MAX) prefix += h;
    }
    this.lines.push({ kind: "text", prefix, runs });
  }

  br(): void {
    if (this.cur) this.finish();
    else this.lines.push({ kind: "blank" });
  }

  blank(): void {
    this.finish();
    this.lines.push({ kind: "blank" });
  }

  rule(): void {
    this.finish();
    this.lines.push({ kind: "rule" });
  }

  code(lang: string, lines: string[]): void {
    this.finish();
    if (lines.length) this.lines.push({ kind: "code", lang, lines });
  }
}

/** Drop whitespace at the line's edges (Discord trims it). */
function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && !out[0].atom && !out[0].text.trim()) out.shift();
  while (out.length && !out[out.length - 1].atom && !out[out.length - 1].text.trim()) out.pop();
  if (out.length) {
    if (!out[0].atom) out[0].text = out[0].text.replace(/^\s+/, "");
    const last = out[out.length - 1];
    if (!last.atom) last.text = last.text.replace(/\s+$/, "");
  }
  return out;
}

/** At most one blank in a row, none at the edges, and no back-to-back rules. */
function normalise(lines: DLine[]): DLine[] {
  const out: DLine[] = [];
  for (const l of lines) {
    if (l.kind === "blank") {
      if (out.length && out[out.length - 1].kind !== "blank") out.push(l);
    } else if (l.kind === "rule") {
      let j = out.length - 1;
      while (j >= 0 && out[j].kind === "blank") j--;
      if (j >= 0 && out[j].kind === "rule") {
        out.length = j + 1;
        continue;
      }
      out.push(l);
    } else {
      out.push(l);
    }
  }
  while (out.length && out[out.length - 1].kind === "blank") out.pop();
  return out;
}

/* --------------------------------------------------------- the main walker */

interface Ctx {
  marks: Mark[];
  px: number | null;
  /** Prefix for every new line here ("" or "> "). */
  base: string;
  listDepth: number;
  inSpoiler: boolean;
}

class Converter {
  b = new Builder();
  constructor(private tables: TablesMode) {}

  children(el: Node, ctx: Ctx): void {
    for (let n = el.firstChild; n; n = n.nextSibling) this.node(n, ctx);
  }

  block(el: Element, ctx: Ctx): void {
    this.b.finish();
    this.children(el, ctx);
    this.b.finish();
  }

  atom(text: string, ctx: Ctx): void {
    this.b.text({ text, marks: ctx.marks, atom: true, px: ctx.px ?? undefined }, ctx.base, true);
  }

  /**
   * A bare URL. Discord's autolink would swallow adjacent markers (`__https://x__` links to
   * `https://x__`), so formatting is dropped; a spoiler keeps it hidden with spaces inside the bars.
   */
  bareUrl(url: string, ctx: Ctx): void {
    const spoiler = ctx.marks.includes("spoiler");
    this.b.text(
      { text: spoiler ? ` ${url} ` : url, marks: spoiler ? ["spoiler"] : [], atom: true, px: ctx.px ?? undefined },
      ctx.base,
      true,
    );
  }

  node(n: Node, outer: Ctx): void {
    if (n.nodeType === TEXT_NODE) {
      const raw = n.nodeValue || "";
      const t = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
      if (!t) return;
      // Ordinary whitespace between tags never starts a line; &nbsp; does (a spacer paragraph).
      const starts = /[^\s]/.test(t) || raw.includes("\u00a0");
      this.b.text({ text: escapeMarkdown(t), marks: outer.marks, px: outer.px ?? undefined }, outer.base, starts);
      return;
    }
    if (n.nodeType !== ELEMENT_NODE) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const px = fontPx(el) ?? H_PX[tag] ?? null;
    const ctx: Ctx = px !== null ? { ...outer, px } : outer;
    const mark = (m: Mark) => this.children(el, ctx.marks.includes(m) ? ctx : { ...ctx, marks: [...ctx.marks, m] });

    switch (tag) {
      case "script":
      case "style":
      case "template":
      case "head":
        return;
      case "br":
        this.b.br();
        return;
      case "hr":
        this.b.rule();
        return;
      case "strong":
      case "b":
        return mark("b");
      case "em":
      case "i":
        return mark("i");
      case "u":
        return mark("u");
      case "s":
      case "strike":
      case "del":
        return mark("s");
      case "a":
        return this.link(el, ctx);
      case "img": {
        const src = (el.getAttribute("src") || "").trim();
        if (!URL_RE.test(src)) return;
        this.b.finish();
        this.bareUrl(src, ctx);
        this.b.finish();
        return;
      }
      case "code": {
        const t = (el.textContent || "").replace(/`/g, "ˋ");
        if (t.trim()) this.atom("`" + t + "`", ctx);
        return;
      }
      case "pre": {
        const lines = (el.textContent || "")
          .replace(/\n$/, "")
          .split("\n")
          .map((l) => l.split(FENCE).join(SAFE_FENCE));
        this.b.code("", lines);
        return;
      }
      case "p":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
      case "tr":
      case "td":
      case "th":
      case "tbody":
      case "thead":
      case "tfoot":
        return this.block(el, ctx);
      case "div":
        return this.div(el, ctx);
      case "ul":
      case "ol":
        return this.list(el, ctx, tag === "ol");
      case "li":
        // A stray item outside a list.
        this.b.finish();
        this.b.nextPrefix = ctx.base + "- ";
        this.children(el, ctx);
        this.b.finish();
        this.b.nextPrefix = null;
        return;
      case "blockquote":
        return this.block(el, { ...ctx, base: "> " });
      case "table":
        return this.table(el, ctx);
      default:
        // span, font, mark and anything else: transparent (colours, fonts, alignment dropped).
        return this.children(el, ctx);
    }
  }

  link(el: Element, ctx: Ctx): void {
    const href = (el.getAttribute("href") || "").trim();
    if (!URL_RE.test(href)) {
      this.children(el, ctx);
      return;
    }
    const text = plainText(el);
    if (!text || text === href) {
      this.bareUrl(href, ctx);
      return;
    }
    const label = escapeMarkdown(text).replace(/[[\]]/g, "\\$&");
    this.atom(`[${label}](${href.replace(/\(/g, "%28").replace(/\)/g, "%29")})`, ctx);
  }

  div(el: Element, ctx: Ctx): void {
    const cls = classOf(el);
    if (/\bipsSpoiler_header\b/.test(cls)) return;
    if (/\bipsSpoiler\b/.test(cls)) {
      // Spoilers are per line: Discord's || can't span a code block or a blank line reliably.
      const marks: Mark[] = ["spoiler", ...ctx.marks.filter((m) => m !== "spoiler")];
      this.block(el, { ...ctx, marks, inSpoiler: true });
      return;
    }
    if (isBordered(el)) {
      this.b.rule();
      this.block(el, ctx);
      this.b.rule();
      return;
    }
    this.block(el, ctx);
  }

  list(el: Element, ctx: Ctx, ordered: boolean): void {
    this.b.finish();
    let n = 0;
    const inner: Ctx = { ...ctx, listDepth: ctx.listDepth + 1 };
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === ELEMENT_NODE && (c as Element).tagName.toLowerCase() === "li") {
        n++;
        this.b.finish();
        this.b.nextPrefix = ctx.base + "  ".repeat(ctx.listDepth) + (ordered ? `${n}. ` : "- ");
        this.children(c, inner);
        this.b.finish();
        this.b.nextPrefix = null;
      } else {
        this.node(c, ctx);
      }
    }
    this.b.finish();
  }

  table(el: Element, ctx: Ctx): void {
    const grid = isGrid(el);
    if (grid && this.tables === "code" && !ctx.inSpoiler) {
      this.b.code("", gridLines(el));
      return;
    }
    this.b.finish();
    for (const row of rowsOf(el)) {
      this.b.finish();
      for (const cell of cellsOf(row)) {
        if (grid && decorationOnly(cell)) continue;
        this.block(cell, ctx);
      }
      this.b.finish();
    }
  }
}

/* ------------------------------------------------- code-block table layout */

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let cur = "";
  for (const word of line.split(" ")) {
    let w = word;
    while (w.length > width) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function frame(lines: string[]): string[] {
  const inner = lines.flatMap((l) => wrapLine(l, COL_MAX - 4));
  const w = Math.max(0, ...inner.map((l) => l.length));
  return ["┌" + "─".repeat(w + 2) + "┐", ...inner.map((l) => "│ " + l.padEnd(w) + " │"), "└" + "─".repeat(w + 2) + "┘"];
}

function tidy(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, "");
    if (!l.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
    } else out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** Plain lines of a cell for the fixed-width layout: no markdown, no escaping. */
function cellLines(root: Element): string[] {
  const lines: string[] = [];
  let cur: string | null = null;
  const finish = () => {
    if (cur !== null) lines.push(cur.trim());
    cur = null;
  };
  const text = (t: string, starts: boolean) => {
    if (cur === null) {
      if (!starts) return;
      cur = "";
    }
    cur += t;
  };
  const walk = (n: Node): void => {
    if (n.nodeType === TEXT_NODE) {
      const raw = n.nodeValue || "";
      const t = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
      if (t) text(t, /\S/.test(t) || raw.includes("\u00a0"));
      return;
    }
    if (n.nodeType !== ELEMENT_NODE) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const cls = classOf(el);
    if (tag === "script" || tag === "style" || /\bipsSpoiler_header\b/.test(cls)) return;
    if (tag === "br") {
      if (cur !== null) finish();
      else lines.push("");
      return;
    }
    if (tag === "hr") {
      finish();
      lines.push(RULE);
      return;
    }
    if (tag === "img") {
      const src = (el.getAttribute("src") || "").trim();
      if (URL_RE.test(src)) {
        finish();
        lines.push(src);
      }
      return;
    }
    if (tag === "a") {
      const href = (el.getAttribute("href") || "").trim();
      if (URL_RE.test(href)) {
        const t = plainText(el);
        text(!t || t === href ? href : `${t} (${href})`, true);
        return;
      }
    }
    if (tag === "div" && isBordered(el)) {
      finish();
      const inner = tidy(cellLines(el));
      if (inner.length) lines.push(...frame(inner));
      return;
    }
    if (tag === "li") {
      finish();
      text("- ", true);
      for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
      finish();
      return;
    }
    if (/^(p|div|h[1-6]|ul|ol|blockquote|table|tbody|thead|tfoot|tr|td|th|pre)$/.test(tag)) {
      finish();
      for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
      finish();
      return;
    }
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
  };
  for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  finish();
  return tidy(lines);
}

/** A grid table as fixed-width lines for a code block. */
function gridLines(table: Element): string[] {
  const rows = rowsOf(table).map((r) =>
    cellsOf(r).map((c) => cellLines(c).flatMap((l) => wrapLine(l.split(FENCE).join(SAFE_FENCE), COL_MAX))),
  );
  const ncols = Math.max(0, ...rows.map((r) => r.length));
  const widths = Array.from({ length: ncols }, (_, c) =>
    Math.max(0, ...rows.map((r) => Math.max(0, ...(r[c] || []).map((l) => l.length)))),
  );
  const out: string[] = [];
  let prevMulti = false;
  for (const row of rows) {
    if (row.every((cell) => cell.length === 0)) continue;
    const multi = row.some((cell) => cell.length > 1);
    if (out.length && (multi || prevMulti)) out.push("");
    const h = Math.max(...row.map((cell) => cell.length));
    for (let k = 0; k < h; k++) {
      const parts: string[] = [];
      for (let c = 0; c < ncols; c++) {
        if (!widths[c]) continue;
        parts.push((row[c]?.[k] ?? "").padEnd(widths[c]));
      }
      out.push(parts.join("  ").trimEnd());
    }
    prevMulti = multi;
  }
  return out;
}

/* --------------------------------------------------------------------- API */

function browserParse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Convert final form HTML into the line IR. */
export function htmlToDiscordDoc(html: string, opts: DiscordOptions = {}): DiscordDoc {
  if (!html.trim()) return { lines: [] };
  const doc = (opts.parser || browserParse)("<body>" + html + "</body>");
  const conv = new Converter(opts.tables || "code");
  conv.children(doc.body, { marks: [], px: null, base: "", listDepth: 0, inSpoiler: false });
  conv.b.finish();
  return { lines: normalise(conv.b.lines) };
}

/** Convert final form HTML to one Discord markdown string (no trailing newline; "" for empty input). */
export function toDiscord(html: string, opts: DiscordOptions = {}): string {
  return htmlToDiscordDoc(html, opts).lines.map(serializeLine).join("\n");
}
