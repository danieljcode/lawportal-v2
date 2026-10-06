// Test-only transcription of the reference js_app.js `renderSections` segment
// split and the `renderList`/`checkRow` grouping loop (js_app.js isn't loadable
// as a module). Instead of DOM it emits plain row records, so tests can compare
// them with formState's segments()/layout(). Never imported from src/.
import type { RefEntry, RefField } from "./oracle";

export interface RowRecord {
  check: string;
  text: string;
  sub: boolean;
  details: string[];
}

export type ItemRecord =
  | { kind: "field"; label: string }
  | { kind: "checklist"; rows: RowRecord[] }
  | { kind: "block"; name: string; items: ItemRecord[] }
  | { kind: "cond"; name: string; items: ItemRecord[] };

export interface SegmentRecord {
  name: string;
  items: ItemRecord[];
}

function isCheck(e: RefEntry | undefined): boolean {
  return !!e && "field" in e && e.field.type === "check";
}

/** renderList: runs of checks become one checklist; same-line fields sit inline in a row. */
export function refRenderList(list: RefEntry[]): ItemRecord[] {
  const out: ItemRecord[] = [];
  let i = 0;
  while (i < list.length) {
    const entry = list[i];
    if (isCheck(entry)) {
      const rows: RowRecord[] = [];
      let prev: RefField | null = null;
      let prevSub = false;
      while (i < list.length && isCheck(list[i])) {
        const f = (list[i] as { field: RefField }).field;
        const details: string[] = [];
        while (i + 1 < list.length) {
          const n = list[i + 1];
          if (!("field" in n) || n.field.type === "check" || n.field.line !== f.line) break;
          details.push(n.field.label);
          i++;
        }
        const sub: boolean = !!(f.indent && prev && f.line - prev.line <= 2 && (!prev.indent || prevSub));
        rows.push({ check: f.label, text: f.text && f.text.length > 2 ? f.text : f.label, sub, details });
        prev = f;
        prevSub = sub;
        i++;
      }
      out.push({ kind: "checklist", rows });
      continue;
    }
    if ("field" in entry) out.push({ kind: "field", label: entry.field.label });
    else if ("block" in entry) out.push({ kind: "block", name: entry.block.name!, items: refRenderList(entry.fields) });
    else if ("cond" in entry) out.push({ kind: "cond", name: entry.cond.name!, items: refRenderList(entry.fields) });
    i++;
  }
  return out;
}

/** renderSections: split at section markers, "Case details" first, empty segments dropped. */
export function refRenderSections(list: RefEntry[]): SegmentRecord[] {
  const segs: Array<{ name: string; entries: RefEntry[] }> = [{ name: "Case details", entries: [] }];
  for (const e of list) {
    if ("section" in e) segs.push({ name: e.section, entries: [] });
    else segs[segs.length - 1].entries.push(e);
  }
  return segs.filter((s) => s.entries.length).map((s) => ({ name: s.name, items: refRenderList(s.entries) }));
}
