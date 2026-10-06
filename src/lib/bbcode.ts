// HTML → BBCode for pasting into an Invision Community editor as plain text.
//
// Rich-text paste ("Copy for forum") is the faithful option; BBCode is the
// fallback. Invision has no table BBCode, so table cells are flattened into
// lines and the UI warns about it. Behaviour follows the reference converter
// (.agents/tasks/jsa-investigation.md §c). Client-only: the default parser uses
// the browser's DOMParser, and nothing touches `window` at import time.

export type HtmlParser = (html: string) => Document;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** CSS px → Invision [size=N]. */
export function pxToSize(px: number): number {
  if (px <= 9) return 1;
  if (px <= 11) return 2;
  if (px <= 13) return 3;
  if (px <= 15) return 4;
  if (px <= 19) return 5;
  if (px <= 26) return 6;
  return 7;
}

/** `[tag=arg]inner[/tag]`, or `inner` unchanged when it is only whitespace (no empty tags). */
function wrap(tag: string, arg: string | number | undefined, inner: string): string {
  if (!inner.trim()) return inner;
  return `[${tag}${arg ? "=" + arg : ""}]${inner}[/${tag}]`;
}

/** `rgb(255, 0, 0)` / `rgba(…)` → `#ff0000`; anything else is returned as-is. */
export function toHex(color: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!m) return color;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function styleOf(el: Element): CSSStyleDeclaration | undefined {
  return (el as HTMLElement).style || undefined;
}

/** Inline size, colour, background and font as BBCode wrappers, innermost first. */
function styled(el: Element, inner: string): string {
  const st = styleOf(el);
  if (!st) return inner;
  let out = inner;
  const size = parseInt(st.fontSize, 10);
  // 13–14px is the forum's body size, so it needs no tag.
  if (size && size !== 13 && size !== 14) out = wrap("size", pxToSize(size), out);
  if (st.color && !/^(rgb\(0, 0, 0\)|#000000|black)$/i.test(st.color)) out = wrap("color", toHex(st.color), out);
  if (st.backgroundColor && !/transparent|rgba\(0, 0, 0, 0\)/.test(st.backgroundColor)) {
    out = wrap("background", toHex(st.backgroundColor), out);
  }
  if (st.fontFamily) out = wrap("font", st.fontFamily.split(",")[0].replace(/["']/g, "").trim(), out);
  return out;
}

function align(el: Element, inner: string): string {
  const a = styleOf(el)?.textAlign;
  return a === "center" || a === "right" || a === "justify" ? wrap(a, "", inner) : inner;
}

function children(el: Node): string {
  let out = "";
  for (let n = el.firstChild; n; n = n.nextSibling) out += convert(n);
  return out;
}

function convert(n: Node): string {
  if (n.nodeType === TEXT_NODE) return (n.nodeValue || "").replace(/\s+/g, " ");
  if (n.nodeType !== ELEMENT_NODE) return "";
  const el = n as Element;
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === "string" ? el.className : "";
  switch (tag) {
    case "br":
      return "\n";
    case "hr":
      return "\n[hr]\n";
    case "strong":
    case "b":
      return styled(el, wrap("b", "", children(el)));
    case "em":
    case "i":
      return styled(el, wrap("i", "", children(el)));
    case "u":
      return styled(el, wrap("u", "", children(el)));
    case "s":
    case "strike":
    case "del":
      return wrap("s", "", children(el));
    case "span":
    case "font":
      return styled(el, children(el));
    case "mark":
      return children(el); // the "unfilled" highlight is preview-only
    case "a":
      return `[url=${el.getAttribute("href")}]${children(el)}[/url]`;
    case "img":
      return `[img]${el.getAttribute("src")}[/img]`;
    case "p":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
      return "\n" + align(el, styled(el, children(el).trim())) + "\n";
    case "ul":
    case "ol":
      return `\n[list${tag === "ol" ? "=1" : ""}]\n` + children(el).replace(/^\s+/, "") + "[/list]\n";
    case "li":
      return "[*]" + styled(el, children(el).trim()) + "\n";
    case "blockquote":
      return "\n[quote]" + children(el).trim() + "[/quote]\n";
    case "table":
      return "\n" + children(el) + "\n";
    case "tbody":
    case "thead":
      return children(el);
    case "tr":
      return children(el) + "\n";
    case "td":
    case "th": {
      // Each non-empty cell becomes its own line; cell alignment is dropped.
      const cell = children(el).trim();
      return cell ? cell + "\n" : "";
    }
    case "div":
      if (/\bipsSpoiler_header\b/.test(cls)) return "";
      if (/\bipsSpoiler\b/.test(cls)) return "\n[spoiler]" + children(el).trim() + "[/spoiler]\n";
      return "\n" + align(el, children(el)) + "\n";
    default:
      return children(el);
  }
}

function browserParse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Convert form HTML to Invision BBCode. The result ends with exactly one newline. */
export function fromHtml(html: string, parser: HtmlParser = browserParse): string {
  const doc = parser("<body>" + html + "</body>");
  return (
    children(doc.body)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}
