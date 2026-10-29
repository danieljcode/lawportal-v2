// Rendering a compiled template with its values to the filing's HTML (SafeHtml), and date formats.

import { trustAsSafeHtml, type SafeHtml } from "../safeHtml";
import type { Field, Node, Tree, Values } from "../types";
import { MONTH_NAMES, pad } from "../deadlines";
import { escapeHtml } from "./escape";

const NUMBER_WORDS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

const ROMAN_STEPS: Array<[number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

const IMAGE_URL = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i;
const ANY_URL = /^https?:\/\/\S+$/i;

/* ----------------------------------------------------------------- render */

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

function roman(n: number): string {
  let out = "";
  let rest = n;
  for (const [value, numeral] of ROMAN_STEPS) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

/** Format an ISO `YYYY-MM-DD` date; anything else is returned unchanged. */
export function formatDate(value: string, fmt?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return value;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const month = MONTH_NAMES[mo - 1];
  if (month === undefined) return value;
  const mon = month.slice(0, 3).toUpperCase();
  switch ((fmt || "long").toLowerCase()) {
    case "short":
      return `${pad(d)}/${mon}/${y}`;
    case "daymon":
      return `${pad(d)}/${mon}`;
    case "us":
      return `${pad(mo)}/${pad(d)}/${y}`;
    case "day":
      return String(d);
    case "ordinal":
      return ordinal(d);
    case "month":
      return month;
    case "year":
      return String(y);
    case "monthday":
      return `${month} ${d}`;
    case "dmy":
      return `${d} ${month} ${y}`;
    case "dmyc":
      return `${d}, ${month}, ${y}`;
    default:
      return `${month} ${d}, ${y}`;
  }
}

/** Lines of free text → HTML: an image URL becomes an image, any http(s) URL a link. */
function richLines(value: unknown): string[] {
  return String(value)
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (IMAGE_URL.test(t)) return `<img src="${escapeHtml(t)}" alt="" />`;
      if (ANY_URL.test(t)) return `<a href="${escapeHtml(t)}">${escapeHtml(t)}</a>`;
      return escapeHtml(line);
    });
}

function spoilerHtml(inner: string): string {
  return (
    '<div class="ipsSpoiler" data-ipsspoiler=""><div class="ipsSpoiler_header"><span>Spoiler</span></div>' +
    '<div class="ipsSpoiler_contents">' +
    inner +
    "</div></div>"
  );
}

function nonEmptyLines(value: unknown): string[] {
  return String(value)
    .split(/\r?\n/)
    .filter((l) => l.trim());
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || value === false;
}

export interface RenderOptions {
  /** Wrap unfilled fallbacks in `<mark class="unfilled" title="Label">`. */
  highlight?: boolean;
  /** The loaded case's exhibits, for an `{{Exhibits@exhibits}}` list (LP-13). */
  exhibits?: ReadonlyArray<{ letter: string; title: string; link?: string }>;
  /** The firm's letterhead from Settings, for a `{{Letterhead@letterhead}}` block (LP-23). */
  letterhead?: { firmName: string; address: string; phone: string; email: string };
}

/** The letterhead: the firm's name, address lines, and phone · email, all escaped. Empty parts are left out. */
function renderLetterhead(f: Field, opts: RenderOptions): string {
  const lh = opts.letterhead;
  if (!lh) {
    if (!f.fallback) return "";
    return opts.highlight ? `<mark class="unfilled" title="${escapeHtml(f.label)}">${f.fallback}</mark>` : f.fallback;
  }
  // In the preview, an unset part shows where it goes; the copied post leaves it out.
  const unset = (what: string) =>
    opts.highlight ? `<mark class="unfilled" title="${escapeHtml(f.label)}">${what}</mark>` : "";
  const name = lh.firmName.trim() ? `<strong>${escapeHtml(lh.firmName.trim())}</strong>` : unset("FIRM NAME");
  const address = nonEmptyLines(lh.address).map((l) => escapeHtml(l.trim()));
  const contact = [lh.phone.trim(), lh.email.trim()].filter(Boolean).map(escapeHtml);
  const lines = [
    name,
    ...(address.length ? address : [unset("FIRM ADDRESS")]),
    contact.length ? contact.join(" · ") : unset("PHONE · EMAIL"),
  ].filter(Boolean);
  return lines.length ? `<p style="text-align:center">${lines.join("<br />\n")}</p>` : "";
}

/** The exhibit list: each exhibit's letter, title and (http(s) only) link, all escaped. */
function renderExhibits(f: Field, opts: RenderOptions): string {
  const list = opts.exhibits || [];
  if (!list.length) {
    if (!f.fallback) return "";
    return opts.highlight ? `<mark class="unfilled" title="${escapeHtml(f.label)}">${f.fallback}</mark>` : f.fallback;
  }
  const items = list.map((e) => {
    const link = e.link && ANY_URL.test(e.link.trim()) ? e.link.trim() : "";
    return (
      "<li><strong>Exhibit " +
      escapeHtml(e.letter) +
      "</strong>: " +
      escapeHtml(e.title) +
      (link ? ` (<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>)` : "") +
      "</li>"
    );
  });
  return "<ul>\n" + items.join("\n") + "\n</ul>";
}

function renderValue(f: Field, value: unknown, opts: RenderOptions): string {
  if (f.type === "check") {
    const on = f.options[0] || "[X]";
    const off = f.options[1] || f.fallback || "[ ]";
    return value ? escapeHtml(on) : off;
  }
  if (isEmpty(value)) {
    if (!f.fallback) return "";
    return opts.highlight ? `<mark class="unfilled" title="${escapeHtml(f.label)}">${f.fallback}</mark>` : f.fallback;
  }
  const text = String(value);
  switch (f.type) {
    case "date":
      return escapeHtml(formatDate(text, f.options[0]));
    case "textarea":
      return richLines(text).join("<br />");
    case "paras": {
      // options[0] is a style from the template (e.g. text-align:justify), never from the filer.
      const style = f.options[0] ? ` style="${escapeHtml(f.options[0])}"` : "";
      return nonEmptyLines(text)
        .map((l) => `<p${style}>${richLines(l.trim())[0]}</p>`)
        .join("\n");
    }
    case "list": {
      const opt = f.options[0] || "";
      const tag = /^(b|strong|em|i|u)$/.test(opt) ? opt : "";
      return nonEmptyLines(text)
        .map((l) => {
          const t = escapeHtml(l.trim());
          return "<li>" + (tag ? `<${tag}>${t}</${tag}>` : t) + "</li>";
        })
        .join("\n");
    }
    case "spoiler":
      return spoilerHtml(
        richLines(text)
          .map((l) => `<p>${l || "&nbsp;"}</p>`)
          .join(""),
      );
    case "image": {
      const t = text.trim();
      return ANY_URL.test(t) ? `<img src="${escapeHtml(t)}" alt="" />` : escapeHtml(text);
    }
    case "url": {
      const t = text.trim();
      return ANY_URL.test(t) ? `<a href="${escapeHtml(t)}">${escapeHtml(t)}</a>` : escapeHtml(text);
    }
    default:
      return escapeHtml(f.options[0] === "upper" ? text.toUpperCase() : text);
  }
}

function renderField(f: Field, value: unknown, opts: RenderOptions): string {
  // `{{Label@exhibits}}` is filled from the loaded case's evidence, not typed (LP-13).
  if (f.character === "exhibits") return renderExhibits(f, opts);
  // `{{Label@letterhead}}` is the firm's letterhead from Settings, not typed (LP-23).
  if (f.character === "letterhead") return renderLetterhead(f, opts);
  const html = renderValue(f, value, opts);
  return f.wrap && !isEmpty(value) && f.type !== "check" ? `<${f.wrap}>${html}</${f.wrap}>` : html;
}

function renderPos(what: string, values: Values, index: number, defaultCount?: number): string {
  switch (what) {
    case "index":
      return String(index + 1);
    case "word":
      return NUMBER_WORDS[index] || String(index + 1);
    case "WORD":
      return (NUMBER_WORDS[index] || String(index + 1)).toUpperCase();
    case "letter":
      return String.fromCharCode(65 + index);
    case "roman":
      return roman(index + 1);
  }
  if (/^roman after /.test(what)) {
    const items = values["#" + what.slice("roman after ".length).trim()];
    return roman((Array.isArray(items) ? items.length : defaultCount || 0) + 1);
  }
  return "";
}

/** `count` empty items: what a block renders before it has any values. */
export function defaultItems(count: number): Values[] {
  return Array.from({ length: count }, () => ({}));
}

function renderNodes(nodes: Node[], values: Values, opts: RenderOptions, index: number): string {
  let out = "";
  for (const n of nodes) {
    switch (n.kind) {
      case "text":
        out += n.html;
        break;
      case "field":
        out += renderField(n.field, values[n.field.label], opts);
        break;
      case "pos":
        out += renderPos(n.what, values, index, n.defaultCount);
        break;
      case "cond": {
        const on = values["?" + n.name];
        if (on === undefined ? n.on : on) out += renderNodes(n.children, values, opts, index);
        break;
      }
      case "block": {
        const stored = values["#" + n.name];
        const items = Array.isArray(stored) ? stored : defaultItems(n.count);
        items.forEach((item, i) => {
          // Item keys shadow outer ones; outer labels stay readable through the prototype.
          const scope: Values = Object.create(values);
          for (const k of Object.keys(item || {})) scope[k] = item[k];
          out += renderNodes(n.children, scope, opts, i);
        });
        break;
      }
      case "section":
        break;
    }
  }
  return out;
}

/** Render a compiled tree with the given values. */
/**
 * The filing's HTML: the template's own markup with every user value escaped
 * (escapeHtml), so it's SafeHtml (LP-5).
 */
export function render(tree: Tree, values?: Values, opts?: RenderOptions): SafeHtml {
  return trustAsSafeHtml(renderNodes(tree.children, values || {}, opts || {}, 0));
}
