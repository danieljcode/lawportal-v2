// Building the line IR: runs, prefixes and blank lines, then tidying it (normalise).
import { headingFor } from "./dom";
import { type DLine, HEADING_MAX, type Run } from "./model";

/* ------------------------------------------------------------ line builder */

export class Builder {
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
export function trimRuns(runs: Run[]): Run[] {
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
export function normalise(lines: DLine[]): DLine[] {
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
