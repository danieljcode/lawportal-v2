// The converter: walks the HTML into the line IR, and the public API (htmlToDiscordDoc, toDiscord).
import { Builder, normalise } from "./builder";
import { H_PX, cellsOf, classOf, decorationOnly, fontPx, isBordered, isGrid, plainText, rowsOf } from "./dom";
import { escapeMarkdown } from "./escape";
import {
  type DiscordDoc,
  type DiscordOptions,
  ELEMENT_NODE,
  FENCE,
  type Mark,
  SAFE_FENCE,
  TEXT_NODE,
  type TablesMode,
  URL_RE,
} from "./model";
import { serializeLine } from "./serialize";
import { gridLines } from "./tables";

/* --------------------------------------------------------- the main walker */

export interface Ctx {
  marks: Mark[];
  px: number | null;
  /** Prefix for every new line here ("" or "> "). */
  base: string;
  listDepth: number;
  inSpoiler: boolean;
}

export class Converter {
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

/* --------------------------------------------------------------------- API */

export function browserParse(html: string): Document {
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
