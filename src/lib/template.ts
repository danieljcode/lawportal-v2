// Token template engine for form HTML.
//
// Templates are the forum's own markup with {{tokens}} where the filer types
// something:
//   {{Label[=prefill][@charField][:type[:opt1;opt2]][>tag][|fallback]}}  a field
//   {{#Name[|count]}} … {{/Name}}      a repeating block (default 1 item, |0 allowed)
//   {{?Name[|off]}} … {{/Name}}        an optional section (on unless |off)
//   {{$index}} {{$word}} {{$WORD}} {{$letter}} {{$roman}}   position inside a block
//   {{$roman after Name}}              the numeral after block Name's last item
//   {{-- Section name}}                starts an input-form section (renders nothing)
//
// An empty field renders its fallback (the original placeholder HTML), so an
// untouched form reproduces the directory template exactly. Behaviour follows
// the reference engine; see .agents/tasks/jsa-investigation.md §b.

import type { BlockEntry, BlockNode, CondEntry, CondNode, Entry, Field, FieldType, Node, Tree, Values } from "./types";

export const TYPES: readonly FieldType[] = [
  "text",
  "textarea",
  "date",
  "number",
  "select",
  "check",
  "spoiler",
  "image",
  "url",
  "list",
  "paras",
];

export const CHARACTER_LABELS: Readonly<Record<string, string>> = {
  name: "Full name",
  title: "Title / position",
  dob: "Date of birth",
  gender: "Gender",
  phone: "Phone number",
  address: "Address",
  occupation: "Occupation",
  bar: "Bar / badge number",
  signature: "Signature",
  email: "Email",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

/** Tags that start a new template line (used for `field.line` and check indents). */
const LINE_BREAK_SRC = "<(?:br|p|li|tr|td|div|hr)\\b";
const IMAGE_URL = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i;
const ANY_URL = /^https?:\/\/\S+$/i;

export function escapeHtml(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function characterLabel(key: string): string {
  return CHARACTER_LABELS[key] || key;
}

/* ------------------------------------------------------------------ parse */

function parseField(token: string): Omit<Field, "line"> {
  let spec = token;
  let fallback = "";
  const bar = spec.indexOf("|");
  if (bar >= 0) {
    fallback = spec.slice(bar + 1);
    spec = spec.slice(0, bar);
  }

  let wrap: string | undefined;
  const wrapMatch = /\s*>\s*([a-z]+)\s*$/.exec(spec);
  if (wrapMatch) {
    wrap = wrapMatch[1];
    spec = spec.slice(0, wrapMatch.index);
  }

  const parts = spec.split(":");
  let head = parts[0].trim();
  let character: string | undefined;
  let prefill: string | undefined;
  const at = head.indexOf("@");
  if (at >= 0) {
    character = head.slice(at + 1).trim();
    head = head.slice(0, at).trim();
  }
  const eq = head.indexOf("=");
  if (eq >= 0) {
    prefill = head.slice(eq + 1).trim();
    head = head.slice(0, eq).trim();
  }

  const label = head || (character ? characterLabel(character) : "");
  const type = (parts[1] || "text").trim().toLowerCase();
  if (!(TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unknown field type '${type}' in {{${spec}}}`);
  }
  // Options are re-joined on ":" first so values like "text-align:justify" survive.
  const options =
    parts.length > 2
      ? parts
          .slice(2)
          .join(":")
          .split(";")
          .map((o) => o.trim())
      : [];
  if (!label) throw new Error(`Field without a label: {{${spec}}}`);

  const field: Omit<Field, "line"> = { fallback, label, type: type as FieldType, options };
  if (wrap !== undefined) field.wrap = wrap;
  if (character !== undefined) field.character = character;
  if (prefill !== undefined) field.prefill = prefill;
  return field;
}

/** Text of a template snippet: inline tags vanish, other tags become spaces. */
function stripTags(html: string): string {
  return html
    .replace(/<\/?(?:em|i|b|strong|u|s|span|font|a)\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words right after a token on the same line (a checkbox's option text). */
function textAfter(src: string, from: number): string {
  const rest = src.slice(from, from + 600);
  const stop = rest.search(/\{\{|<br|<\/p>|<\/li>|<\/td>|<p\b|<li\b/i);
  return stripTags(stop >= 0 ? rest.slice(0, stop) : rest)
    .replace(/^[-—–:\s]+/, "")
    .replace(/[\s—–-]+$/, "");
}

/** True when the line before a check token is only non-breaking-space indentation. */
function isIndented(src: string, tokenStart: number): boolean {
  const before = src.slice(Math.max(0, tokenStart - 400), tokenStart);
  const breaks = new RegExp(LINE_BREAK_SRC, "gi");
  let cut = -1;
  for (let b = breaks.exec(before); b; b = breaks.exec(before)) {
    cut = before.indexOf(">", b.index) + 1;
  }
  const lineStart = cut > 0 ? before.slice(cut) : before;
  return /(&nbsp;|\u00a0)[\s\S]*(&nbsp;|\u00a0)/.test(lineStart) && !/\w/.test(stripTags(lineStart));
}

function countBreaks(html: string): number {
  return (html.match(new RegExp(LINE_BREAK_SRC, "gi")) || []).length;
}

/** Compile template source into a tree. Throws on unknown types and unbalanced blocks. */
export function compile(src: string): Tree {
  const root: Tree = { kind: "block", name: "", count: 1, children: [] };
  const stack: Array<BlockNode | CondNode> = [root];
  const blockCounts: Record<string, number> = {};
  const tokens = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;
  let line = 0;

  for (let m = tokens.exec(src); m; m = tokens.exec(src)) {
    const top = stack[stack.length - 1];
    if (m.index > last) {
      const chunk = src.slice(last, m.index);
      top.children.push({ kind: "text", html: chunk });
      line += countBreaks(chunk);
    }
    last = tokens.lastIndex;
    const spec = m[1].trim();

    if (spec[0] === "#") {
      const [name, countText] = spec.slice(1).split("|");
      const n = parseInt(countText, 10);
      const node: BlockNode = {
        kind: "block",
        name: name.trim(),
        count: Number.isNaN(n) ? 1 : Math.max(0, n),
        children: [],
      };
      blockCounts[node.name] = node.count;
      top.children.push(node);
      stack.push(node);
    } else if (spec[0] === "?") {
      const [name, flag] = spec.slice(1).split("|");
      const node: CondNode = { kind: "cond", name: name.trim(), on: (flag || "").trim() !== "off", children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (spec[0] === "/") {
      const name = spec.slice(1).trim();
      if (stack.length === 1 || top.name !== name) throw new Error(`{{/${name}}} closes {{#${top.name}}}`);
      stack.pop();
    } else if (spec.startsWith("--")) {
      top.children.push({ kind: "section", name: spec.slice(2).trim() });
    } else if (spec[0] === "$") {
      const what = spec.slice(1).trim();
      const after = /^roman after (.+)$/.exec(what);
      top.children.push({ kind: "pos", what, defaultCount: after ? blockCounts[after[1].trim()] : undefined });
    } else {
      const field: Field = { ...parseField(spec), line };
      if (field.type === "check") {
        field.text = textAfter(src, tokens.lastIndex);
        field.indent = isIndented(src, m.index);
      }
      top.children.push({ kind: "field", field });
    }
  }

  if (stack.length > 1) throw new Error(`Unclosed {{#${stack[stack.length - 1].name}}}`);
  if (last < src.length) root.children.push({ kind: "text", html: src.slice(last) });
  return root;
}

/* ----------------------------------------------------------------- fields */

/** Labels already claimed by an enclosing scope; `true` = listed, `false` = will be listed there. */
type Seen = Record<string, boolean>;

function entryKey(e: Entry): string {
  if ("field" in e) return e.field.label;
  if ("block" in e) return "#" + e.block.name;
  if ("cond" in e) return "?" + e.cond.name;
  return "--" + e.section;
}

/** Add a block entry, merging it into an earlier same-named block (one copy per table column). */
function mergeBlock(list: Entry[], entry: BlockEntry): void {
  const existing = list.find((e): e is BlockEntry => "block" in e && e.block.name === entry.block.name);
  if (!existing) {
    list.push(entry);
    return;
  }
  for (const e of entry.fields) {
    if ("block" in e) mergeBlock(existing.fields, e);
    else if (!existing.fields.some((x) => entryKey(x) === entryKey(e))) existing.fields.push(e);
  }
}

/**
 * The input list in order of first appearance. Fields sharing a label share a
 * value; labels used directly in an enclosing scope stay shared inside blocks.
 */
export function fields(tree: { children: Node[] }, outer?: Seen): Entry[] {
  const out: Entry[] = [];
  // Inherit from the enclosing scope so `label in seen` sees outer labels too.
  const seen: Seen = Object.create(outer || null);
  for (const n of tree.children) {
    if (n.kind === "field") seen[n.field.label] = seen[n.field.label] || false;
  }
  for (const n of tree.children) {
    if (n.kind === "section") {
      if (!outer) out.push({ section: n.name });
    } else if (n.kind === "field") {
      const label = n.field.label;
      if (seen[label] || (outer && label in outer)) continue;
      seen[label] = true;
      out.push({ field: n.field });
    } else if (n.kind === "cond") {
      const entry: CondEntry = { cond: n, fields: fields(n, seen) };
      out.push(entry);
    } else if (n.kind === "block") {
      mergeBlock(out, { block: n, fields: fields(n, seen) });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- prefill */

export function todayUTC(now?: Date): string {
  return (now || new Date()).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `"today+21"` → `{base:"today", days:21}`; `"Filing date - 7"` → `{base:"Filing date", days:-7}`. */
export function dateRule(expr: string): { base: string; days: number } {
  const m = /^(.+?)\s*([+-])\s*(\d+)$/.exec(expr.trim());
  if (!m) return { base: expr.trim(), days: 0 };
  return { base: m[1].trim(), days: (m[2] === "-" ? -1 : 1) * Number(m[3]) };
}

export type Lookup = (label: string) => string | undefined;

/**
 * The value a field starts with ("" when none).
 * Text: a leading `YY` becomes the 2-digit UTC year; `<Label?A=x;B=y>` becomes the
 * code for another field's current value, and if that has no match the whole prefill is "".
 * Date: `today`, `today±N` or `<Label>±N` days, in UTC.
 */
export function prefillValue(f: Field, now?: Date, lookup?: Lookup): string {
  if (!f.prefill) return "";
  const when = now || new Date();
  if (f.type !== "date") {
    let missing = false;
    const out = f.prefill
      .replace(/^YY/, String(when.getUTCFullYear()).slice(-2))
      .replace(/<([^?>]+)\?([^>]*)>/g, (_m, label: string, map: string) => {
        const current = lookup ? lookup(label.trim()) : undefined;
        const hit = map
          .split(";")
          .map((pair) => pair.split("="))
          .find((kv) => kv.length === 2 && kv[0].trim() === current);
        if (!hit) {
          missing = true;
          return "";
        }
        return hit[1].trim();
      });
    return missing ? "" : out;
  }
  const rule = dateRule(f.prefill);
  const base = rule.base === "today" ? todayUTC(when) : lookup ? lookup(rule.base) : undefined;
  return base ? addDays(base, rule.days) : "";
}

/**
 * The display pattern for a case-number field: 2-digit year + courthouse +
 * division + number (src/lib/courts.ts; port-forms writes the courthouse into
 * each form's prefill, e.g. `YYSCCR00XXX`). The `prefill` is expanded the same way
 * `prefillValue` does (`^YY` → 2-digit year of `now`, which callers pass as the
 * server date; `<Label?A=x;B=y>` → the code for another field's current value)
 * but, unlike `prefillValue`, when the `<Division?…>` lookup misses it falls
 * back to the FIRST code listed in the token so the placeholder is never empty
 * (an un-chosen Division still shows a concrete `90SCCR00XXX`-style pattern).
 * Returns "" when the field has no prefill (callers skip those).
 */
export function caseNumberPattern(f: Field, now: Date | undefined, lookup?: Lookup): string {
  if (!f.prefill) return "";
  const when = now || new Date();
  return f.prefill
    .replace(/^YY/, String(when.getUTCFullYear()).slice(-2))
    .replace(/<([^?>]+)\?([^>]*)>/g, (_m, label: string, map: string) => {
      const pairs = map
        .split(";")
        .map((pair) => pair.split("="))
        .filter((kv) => kv.length === 2);
      const current = lookup ? lookup(label.trim()) : undefined;
      const hit = pairs.find((kv) => kv[0].trim() === current);
      // Lookup miss → the first listed code, so the pattern stays concrete.
      return (hit ? hit[1] : pairs[0] ? pairs[0][1] : "").trim();
    });
}

/** Labels a field's prefill depends on, so it can be recomputed when they change. */
export function prefillDeps(f: Field): string[] {
  if (!f.prefill) return [];
  if (f.type === "date") {
    const base = dateRule(f.prefill).base;
    return base === "today" ? [] : [base];
  }
  const deps: string[] = [];
  for (const m of f.prefill.matchAll(/<([^?>]+)\?/g)) deps.push(m[1].trim());
  return deps;
}

/* ----------------------------------------------------------------- render */

function pad2(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

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
      return `${pad2(d)}/${mon}/${y}`;
    case "daymon":
      return `${pad2(d)}/${mon}`;
    case "us":
      return `${pad2(mo)}/${pad2(d)}/${y}`;
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
export function render(tree: Tree, values?: Values, opts?: RenderOptions): string {
  return renderNodes(tree.children, values || {}, opts || {}, 0);
}

/* ------------------------------------------------------------------ plain */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: "\u00a0",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function fromCodePoint(code: number, raw: string): string {
  if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return raw;
  return String.fromCodePoint(code);
}

/** Plain text of a fallback snippet, for input placeholders (DOM-free `textContent`). */
export function plain(html: string): string {
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:(nbsp|amp|lt|gt|quot|apos)|#(\d+)|#[xX]([0-9a-fA-F]+));/g,
      (raw, name?: string, dec?: string, hex?: string) => {
        if (name) return NAMED_ENTITIES[name];
        if (dec) return fromCodePoint(parseInt(dec, 10), raw);
        return fromCodePoint(parseInt(hex as string, 16), raw);
      },
    )
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .slice(0, 160);
}
