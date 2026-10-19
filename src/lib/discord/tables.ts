// Tables as fixed-width code blocks (grids, like the court caption) or plain lines.
import { cellsOf, classOf, isBordered, plainText, rowsOf } from "./dom";
import { COL_MAX, ELEMENT_NODE, FENCE, RULE, SAFE_FENCE, TEXT_NODE, URL_RE } from "./model";

/* ------------------------------------------------- code-block table layout */

export function wrapLine(line: string, width: number): string[] {
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

export function frame(lines: string[]): string[] {
  const inner = lines.flatMap((l) => wrapLine(l, COL_MAX - 4));
  const w = Math.max(0, ...inner.map((l) => l.length));
  return ["┌" + "─".repeat(w + 2) + "┐", ...inner.map((l) => "│ " + l.padEnd(w) + " │"), "└" + "─".repeat(w + 2) + "┘"];
}

export function tidy(lines: string[]): string[] {
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
export function cellLines(root: Element): string[] {
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
export function gridLines(table: Element): string[] {
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
