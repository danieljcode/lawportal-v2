// How the editor lays a form out: sections, checklists and their filled counts.

import type { BlockEntry, CondEntry, Entry, Field, Values } from "../types";
import { eachField } from "./state";

/* ------------------------------------------------------------ layout */

export interface Segment {
  name: string;
  entries: Entry[];
}

/** Split at `{{-- Name}}` markers; anything before the first is "Case details". Empty segments are dropped. */
export function segments(entries: Entry[]): Segment[] {
  const out: Segment[] = [{ name: "Case details", entries: [] }];
  for (const e of entries) {
    if ("section" in e) out.push({ name: e.section, entries: [] });
    else out[out.length - 1].entries.push(e);
  }
  return out.filter((sg) => sg.entries.length > 0);
}

export interface ChecklistRow {
  check: Field;
  /** Fields on the same template line, shown inline in the row. */
  details: Field[];
  /** Indented under the previous option. */
  sub: boolean;
  /** The row's label text. */
  text: string;
}

export type LayoutItem =
  | { kind: "field"; field: Field }
  | { kind: "checklist"; rows: ChecklistRow[] }
  | { kind: "block"; entry: BlockEntry }
  | { kind: "cond"; entry: CondEntry };

/** Group an entry list for rendering: runs of checks become checklists with inline details. */
export function layout(entries: Entry[]): LayoutItem[] {
  const out: LayoutItem[] = [];
  const isCheck = (e: Entry | undefined): boolean => !!e && "field" in e && e.field.type === "check";
  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    if (isCheck(entry)) {
      const rows: ChecklistRow[] = [];
      let prev: Field | null = null;
      let prevSub = false;
      while (i < entries.length && isCheck(entries[i])) {
        const f = (entries[i] as { field: Field }).field;
        const details: Field[] = [];
        for (;;) {
          const next = entries[i + 1];
          if (!next || !("field" in next) || next.field.type === "check" || next.field.line !== f.line) break;
          details.push(next.field);
          i++;
        }
        // Nest only directly under a non-indented option (or its other sub-options).
        const sub: boolean = !!(f.indent && prev && f.line - prev.line <= 2 && (!prev.indent || prevSub));
        const text = f.text && f.text.length > 2 ? f.text : f.label;
        rows.push({ check: f, details, sub, text });
        prev = f;
        prevSub = sub;
        i++;
      }
      out.push({ kind: "checklist", rows });
      continue;
    }
    if ("field" in entry) out.push({ kind: "field", field: entry.field });
    else if ("block" in entry) out.push({ kind: "block", entry });
    else if ("cond" in entry) out.push({ kind: "cond", entry });
    i++;
  }
  return out;
}

/** "2 of 5 filled · 3 ticked" counts for a section header. */
export function sectionMeta(
  entries: Entry[],
  values: Values,
): { filled: number; total: number; ticked: number; done: boolean } {
  let filled = 0;
  let total = 0;
  let ticked = 0;
  const checkLines = new Set<number>();
  eachField(entries, values, (f) => {
    if (f.type === "check") checkLines.add(f.line);
  });
  eachField(entries, values, (f, scope) => {
    if (f.type === "check") {
      if (scope[f.label]) ticked++;
      return;
    }
    if (checkLines.has(f.line)) return; // an inline "Other: ___" box belongs to its checkbox
    if (f.character === "exhibits") return; // filled from the case's evidence, not typed (LP-13)
    total++;
    const v = scope[f.label];
    if (v && !(f.prefill && typeof v === "string" && /XXX/.test(v))) filled++;
  });
  return { filled, total, ticked, done: total > 0 && filled === total };
}

/** "Defendants" → "Defendant", "Parties" → "Party". */
export function singular(name: string): string {
  return name.replace(/ies$/, "y").replace(/(s)$/, "");
}
