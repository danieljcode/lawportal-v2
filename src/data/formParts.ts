// A built-in form split into the parts a copy is made of (LP-225): each top-level
// element (with any repeating or optional section kept whole) is one part. A part
// that is one styled paragraph of plain wording can be reworded; the rest is kept
// as it is. Pure: no storage.

const VOID = /^(br|hr|img|wbr|col|input|meta|link|area|source)$/i;
const ITEM = /\{\{[\s\S]*?\}\}|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

/** The form's top-level parts, in order; joined they give the HTML back exactly. */
export function formParts(html: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let blocks = 0;
  for (const m of html.matchAll(ITEM)) {
    const s = m[0];
    if (s.startsWith("{{")) {
      const c = s.slice(2).trim()[0];
      if (c === "#" || c === "?") blocks++;
      else if (c === "/") blocks = Math.max(0, blocks - 1);
    } else if (m[1]) depth = Math.max(0, depth - 1);
    else if (!m[3] && !VOID.test(m[2])) depth++;
    if (!depth && !blocks) {
      const end = m.index + s.length;
      parts.push(html.slice(start, end));
      start = end;
    }
  }
  if (start < html.length) parts.push(html.slice(start));
  // A part that's only whitespace joins the one before it.
  return parts.reduce<string[]>((out, p) => {
    if (out.length && !p.trim()) out[out.length - 1] += p;
    else out.push(p);
    return out;
  }, []);
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decode(s: string): string | null {
  let ok = true;
  const out = s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const hex = /^#x/i.test(e);
      const n = parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (n > 0 && n <= 0x10ffff) return String.fromCodePoint(n);
      ok = false;
      return "";
    }
    if (e in ENTITIES) return ENTITIES[e];
    ok = false;
    return "";
  });
  return ok ? out.replace(/\s+/g, " ").trim() : null;
}

/** Where the wording sits in a wording part's HTML. */
export const WORDING_MARK = "\u0000";

/**
 * A part that is one paragraph of plain wording (tags only around it, no fields):
 * its wording and its HTML with WORDING_MARK in the wording's place. Null otherwise.
 */
export function wordingOf(part: string): { text: string; shell: string } | null {
  const p = /^(\s*<p\b[^>]*>)([\s\S]*)(<\/p>\s*)$/i.exec(part);
  if (!p || p[2].includes("{{") || /<p\b/i.test(p[2])) return null;
  const inner = /^((?:\s|<[^>]+>)*)([\s\S]*?)((?:\s|<[^>]+>)*)$/.exec(p[2])!;
  if (inner[2].includes("<")) return null;
  const text = decode(inner[2]);
  if (!text) return null;
  return { text, shell: p[1] + inner[1] + WORDING_MARK + inner[3] + p[3] };
}

/** A short hash (FNV-1a), to tell when a built-in form's part has changed since it was copied. */
export function partHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

const FIELD = /\{\{\s*([^#?/$\-\s][^}]*?)\}\}/g;
const labelOf = (spec: string) => spec.split(/[=@:>|]/)[0].trim();

/** The labels of the fields in some template HTML, in order, each once. */
export function fieldLabels(html: string): string[] {
  return [...new Set([...html.matchAll(FIELD)].map((m) => labelOf(m[1])).filter(Boolean))];
}

/** The HTML with fields relabelled (old label → new); everything else about each field stays. */
export function renameFields(html: string, renames: Record<string, string> | undefined): string {
  if (!renames) return html;
  return html.replace(FIELD, (all, spec: string) => {
    const label = labelOf(spec);
    const to = Object.prototype.hasOwnProperty.call(renames, label) ? renames[label] : undefined;
    return to ? "{{" + to + spec.trim().slice(label.length) + "}}" : all;
  });
}
