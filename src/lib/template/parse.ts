// Parsing templates: {{token}} syntax into a tree (compile) and the list of inputs (fields).

import type { BlockEntry, BlockNode, CondEntry, CondNode, Entry, Field, FieldType, Node, Tree } from "../types";

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

/** Tags that start a new template line (used for `field.line` and check indents). */
const LINE_BREAK_SRC = "<(?:br|p|li|tr|td|div|hr)\\b";

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
