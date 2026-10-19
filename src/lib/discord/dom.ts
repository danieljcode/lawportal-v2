// Reading the HTML: styles, font sizes, borders, text and table structure.
import { GRID_CELL_MAX } from "./model";

/* ------------------------------------------------------------------ helpers */

export function styleAttr(el: Element): string {
  return el.getAttribute("style") || "";
}

/** Inline font-size in px, or null. */
export function fontPx(el: Element): number | null {
  const m = /(?:^|;)\s*font-size\s*:\s*([\d.]+)\s*(px|pt)?/i.exec(styleAttr(el));
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] && m[2].toLowerCase() === "pt" ? (n * 4) / 3 : n;
}

/** A div with a visible inline border (the forum's boxed sections). */
export function isBordered(el: Element): boolean {
  const re = /(?:^|;)\s*border(?:-(?:top|right|bottom|left))?\s*:\s*([^;]*)/gi;
  const style = styleAttr(el);
  for (let m = re.exec(style); m; m = re.exec(style)) {
    const v = m[1].trim().toLowerCase();
    if (v && !/^(none|0|0px|hidden)\b/.test(v)) return true;
  }
  return false;
}

export function classOf(el: Element): string {
  const c = el.getAttribute("class");
  return c || "";
}

export function plainText(el: Node): string {
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

export const H_PX: Record<string, number> = { h1: 28, h2: 22, h3: 18, h4: 16 };

export function elementChildren(el: Element): Element[] {
  return Array.from(el.children);
}

export function rowsOf(table: Element): Element[] {
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

export function cellsOf(row: Element): Element[] {
  return elementChildren(row).filter((c) => /^t[dh]$/i.test(c.tagName));
}

/** A cell with text. Images don't count: a seal next to a heading is layout, not a grid column. */
export function cellNonEmpty(cell: Element): boolean {
  return plainText(cell) !== "";
}

/** Only the caption's `)` decoration column (or nothing). */
export function decorationOnly(cell: Element): boolean {
  return cell.querySelector("img") === null && /^[\s)]*$/.test(plainText(cell));
}

/** A real grid: some row has 2+ filled cells, and no cell holds long prose. */
export function isGrid(table: Element): boolean {
  const rows = rowsOf(table);
  if (!rows.some((r) => cellsOf(r).filter(cellNonEmpty).length >= 2)) return false;
  return rows.every((r) => cellsOf(r).every((c) => plainText(c).length <= GRID_CELL_MAX));
}
