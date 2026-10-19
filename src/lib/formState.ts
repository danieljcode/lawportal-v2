// Per-form state, pure (design §Per-form state, plan §R R1–R3, R6).
//
// FormView keeps one FormState and replaces it through these functions. They
// mirror the in-place edits of the reference app (fieldInput, checkRow,
// condInput, blockInput, applyPrefills, fillFromCharacter, loadDocket,
// saveFormToDocket) but never mutate their input: only the objects along the
// edited path are copied.

import type { BlockEntry, Character, CondEntry, Docket, Entry, Field, FormDef, Scalar, Values } from "./types";
import { defaultItems, prefillDeps, prefillValue, todayUTC } from "./template";
import { courthouseFor, DIVISION_COURTS, GENERAL_COURT } from "./courts";
import { DIVISION_CODES, divisionFor } from "./dockets";
import { readJson, writeJson, type KV } from "./storage";

export interface FormState {
  values: Values;
  /** Label → the value "Fill from character" put there last. */
  autofilled: Record<string, string>;
  /** Label → the value a prefill computed last. */
  derived: Record<string, string>;
}

/** Location of a scope: [] = top level; [{block:"Defendants",index:0},{block:"Accusations",index:1}] = a nested item. */
export type ScopePath = Array<{ block: string; index: number }>;

export const EMPTY_STATE: FormState = Object.freeze({
  values: Object.freeze({}) as Values,
  autofilled: Object.freeze({}) as Record<string, string>,
  derived: Object.freeze({}) as Record<string, string>,
});

export const PLAINTIFF_LABELS = [
  "Plaintiff name",
  "Plaintiff name(s)",
  "Petitioner name",
  "Appellant name",
  "Petitioners (names)",
];
export const DEFENDANT_LABELS = ["Defendant name", "Defendant name(s)"];
export const FILED_LABELS = ["Action filed", "Filing date"];

/* ------------------------------------------------------------ scope paths */

function isItem(v: unknown): v is Values {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function itemsOf(scope: Values, block: string): Values[] | null {
  const items = scope["#" + block];
  return Array.isArray(items) ? items : null;
}

/** The scope object at `path`, or null when a step doesn't exist. */
export function scopeAt(values: Values, path: ScopePath): Values | null {
  let scope: Values = values;
  for (const step of path) {
    const items = itemsOf(scope, step.block);
    const item = items ? items[step.index] : undefined;
    if (!isItem(item)) return null;
    scope = item;
  }
  return scope;
}

/** Copy the objects along `path` and replace the scope at its end with `fn(scope)`; null when the path is stale. */
function updateAt(values: Values, path: ScopePath, fn: (scope: Values) => Values): Values | null {
  if (!path.length) return fn(values);
  const [step, ...rest] = path;
  const items = itemsOf(values, step.block);
  const item = items ? items[step.index] : undefined;
  if (!items || !isItem(item)) return null;
  const next = updateAt(item, rest, fn);
  if (!next) return null;
  if (next === item) return values;
  const copy = items.slice();
  copy[step.index] = next;
  return { ...values, ["#" + step.block]: copy };
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const copy = { ...map };
  delete copy[key];
  return copy;
}

/* ------------------------------------------------------------ walking */

type Visit = (f: Field, scope: Values) => void;

/** Every field with the scope it lives in (block items are their own scope; conds share their parent's). */
function eachField(entries: Entry[], scope: Values, fn: Visit): void {
  for (const e of entries) {
    if ("field" in e) fn(e.field, scope);
    else if ("cond" in e) eachField(e.fields, scope, fn);
    else if ("block" in e) {
      for (const item of itemsOf(scope, e.block.name) || []) {
        if (isItem(item)) eachField(e.fields, item, fn);
      }
    }
  }
}

/** Plain deep copy of form values (strings, booleans, arrays of items). */
function cloneValues(v: Values): Values {
  const out: Values = {};
  for (const k of Object.keys(v)) {
    const x = v[k];
    out[k] = Array.isArray(x) ? x.map((item) => (isItem(item) ? cloneValues(item) : item)) : x;
  }
  return out;
}

function labelsOf(entries: Entry[], values: Values): Set<string> {
  const have = new Set<string>();
  eachField(entries, values, (f) => have.add(f.label));
  return have;
}

function str(v: Scalar | Values[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/* ------------------------------------------------------------ update API */

function materialize(entries: Entry[], scope: Values): Values {
  let out = scope;
  for (const e of entries) {
    if ("cond" in e) {
      // Conds don't create scopes; hidden bodies are still materialised.
      out = materialize(e.fields, out);
    } else if ("block" in e) {
      const key = "#" + e.block.name;
      const current = out[key];
      const items = Array.isArray(current) ? current : defaultItems(e.block.count);
      let changed = items !== current;
      const next = items.map((item) => {
        const base = isItem(item) ? item : {};
        const m = materialize(e.fields, base);
        if (m !== item) changed = true;
        return m;
      });
      if (changed) out = { ...out, [key]: next };
    }
  }
  return out;
}

/** Give every block that has no items array its default items (recursively). Returns `values` when nothing changed. */
export function materializeBlocks(entries: Entry[], values: Values): Values {
  return materialize(entries, values);
}

/**
 * A field edit: "" or false deletes the key, anything else sets it; the label's
 * autofilled/derived marks are cleared; a Division change swaps the case-number code in that scope.
 */
export function setValue(s: FormState, path: ScopePath, label: string, v: string | boolean): FormState {
  const autofilled = without(s.autofilled, label);
  const derived = without(s.derived, label);
  const values = updateAt(s.values, path, (scope) => {
    let next: Values;
    if (v === "" || v === false) {
      if (!(label in scope)) next = scope;
      else {
        next = { ...scope };
        delete next[label];
      }
    } else next = scope[label] === v ? scope : { ...scope, [label]: v };
    if (label === "Division") next = swapCaseCode(next, typeof v === "string" ? v : "", derived["Case number"]);
    return next;
  });
  if (!values) return s;
  if (values === s.values && autofilled === s.autofilled && derived === s.derived) return s;
  return { values, autofilled, derived };
}

/** Switch a conditional section; stored as a boolean (never deleted), so an on-by-default cond can be off. */
export function setCond(s: FormState, path: ScopePath, name: string, on: boolean): FormState {
  const key = "?" + name;
  const values = updateAt(s.values, path, (scope) => (scope[key] === on ? scope : { ...scope, [key]: on }));
  return values && values !== s.values ? { ...s, values } : s;
}

function editItems(s: FormState, path: ScopePath, block: string, fn: (items: Values[]) => Values[] | null): FormState {
  const key = "#" + block;
  const values = updateAt(s.values, path, (scope) => {
    const items = itemsOf(scope, block);
    const next = items ? fn(items) : null;
    return next ? { ...scope, [key]: next } : scope;
  });
  return values && values !== s.values ? { ...s, values } : s;
}

/** Append an empty item (run afterAddItem to materialise its nested blocks). */
export function addItem(s: FormState, path: ScopePath, block: string): FormState {
  return editItems(s, path, block, (items) => [...items, {}]);
}

/** Remove item `i`; any block can go down to 0 items. */
export function removeItem(s: FormState, path: ScopePath, block: string, i: number): FormState {
  return editItems(s, path, block, (items) => (i >= 0 && i < items.length ? items.filter((_x, j) => j !== i) : null));
}

/** Swap item `i` with its neighbour; a no-op at the ends. */
export function moveItem(s: FormState, path: ScopePath, block: string, i: number, d: -1 | 1): FormState {
  return editItems(s, path, block, (items) => {
    const j = i + d;
    if (i < 0 || i >= items.length || j < 0 || j >= items.length) return null;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
}

/** True when another field's prefill depends on `label` (so prefills must be re-applied after it changes). */
export function hasDependents(entries: Entry[], values: Values, label: string): boolean {
  let found = false;
  eachField(entries, values, (f) => {
    if (!found && prefillDeps(f).includes(label)) found = true;
  });
  return found;
}

/* ------------------------------------------------------------ rules */

/**
 * Fill each prefilled field that is empty or still holds what was derived last
 * time; never overwrites user input. Up to 5 passes so chains (Judgement → schedule) settle.
 */
export function applyPrefills(entries: Entry[], s: FormState, now?: Date): FormState {
  const when = now || new Date();
  const values = cloneValues(s.values);
  const derived = { ...s.derived };
  let any = false;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    eachField(entries, values, (f, scope) => {
      if (!f.prefill) return;
      const current = scope[f.label];
      const ours = derived[f.label] !== undefined && derived[f.label] === current;
      if (current !== undefined && !ours) return;
      const v = prefillValue(f, when, (label) => str(scope[label]));
      if (v && v !== current) {
        scope[f.label] = v;
        derived[f.label] = v;
        changed = true;
      }
    });
    if (!changed) break;
    any = true;
  }
  return any ? { values, autofilled: s.autofilled, derived } : s;
}

/**
 * Fill `@character` fields from `char`. Without force only empty fields or ones
 * still holding the previous autofill change; a stale autofill the character lacks is removed.
 */
export function fillFromCharacter(entries: Entry[], s: FormState, char: Character | null, force: boolean): FormState {
  const values = cloneValues(s.values);
  const autofilled = { ...s.autofilled };
  let changed = false;
  eachField(entries, values, (f, scope) => {
    if (!f.character) return;
    const current = scope[f.label];
    const mine = autofilled[f.label] !== undefined && autofilled[f.label] === current;
    if (!force && current && !mine) return;
    const raw = char ? (char as unknown as Record<string, unknown>)[f.character] : undefined;
    const v = typeof raw === "string" ? raw : "";
    if (v) {
      if (current !== v || autofilled[f.label] !== v) changed = true;
      scope[f.label] = v;
      autofilled[f.label] = v;
    } else if (mine || force) {
      if (f.label in scope || f.label in autofilled) changed = true;
      delete scope[f.label];
      delete autofilled[f.label];
    }
  });
  return changed ? { values, autofilled, derived: s.derived } : s;
}

/**
 * A hand-typed case number keeps its digits when the division changes; only the
 * code is swapped (90SCCR00147 → 90SCCC00147). A number that is still the derived value is left for applyPrefills.
 */
export function swapCaseCode(scope: Values, division: string, derivedCaseNumber: string | undefined): Values {
  const code = Object.keys(DIVISION_CODES).find((k) => DIVISION_CODES[k] === division);
  const current = str(scope["Case number"]);
  const m = /^(\d{2}[A-Z]{2})(CR|CC|TC|SM)(.+)$/i.exec(current || "");
  if (!code || !m || derivedCaseNumber === current) return scope;
  const next = m[1] + code + m[3];
  return next === current ? scope : { ...scope, "Case number": next };
}

/** R3: the date "Auto" button. Clears the value and its derived mark, then always re-applies prefills. */
export function autoDate(entries: Entry[], s: FormState, path: ScopePath, label: string, now?: Date): FormState {
  return applyPrefills(entries, setValue(s, path, label, ""), now);
}

/** R3: the date "Today" button (UTC). Prefills are re-applied only when other fields depend on this one. */
export function todayDate(entries: Entry[], s: FormState, path: ScopePath, label: string, now?: Date): FormState {
  const next = setValue(s, path, label, todayUTC(now));
  return hasDependents(entries, next.values, label) ? applyPrefills(entries, next, now) : next;
}

/** R1: the state a form opens with: the draft (or empty), blocks materialised, prefills, then the non-force character fill. */
export function openState(entries: Entry[], draft: FormState | null, char: Character | null, now?: Date): FormState {
  const base = draft || { values: {}, autofilled: {}, derived: {} };
  const s: FormState = { ...base, values: materializeBlocks(entries, base.values) };
  return fillFromCharacter(entries, applyPrefills(entries, s, now), char, false);
}

/** R6: what FormView runs after addItem: materialise, prefill, then the non-force character fill. */
export function afterAddItem(entries: Entry[], s: FormState, char: Character | null, now?: Date): FormState {
  const values = materializeBlocks(entries, s.values);
  const m = values === s.values ? s : { ...s, values };
  return fillFromCharacter(entries, applyPrefills(entries, m, now), char, false);
}

/* ------------------------------------------------------------ dockets */

function titleWords(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** More than one name ("A and B", "A, B") reads as plural. */
function plural(names: string | undefined): boolean {
  return /,|\band\b|&/i.test(names || "");
}

/** True when the form has a field with this label (anywhere, including block items). */
export function hasField(entries: Entry[], values: Values, label: string): boolean {
  return labelsOf(entries, values).has(label);
}

/**
 * Put a docket entry's details into whichever of the matching fields the form
 * has (top level), clearing their derived/autofilled marks. The caller then runs
 * materializeBlocks → applyPrefills (a loaded judgement date reflows a schedule).
 */
export function docketToForm(entries: Entry[], s: FormState, d: Docket): { state: FormState; filled: number } {
  const have = labelsOf(entries, s.values);
  const values: Values = { ...s.values };
  let autofilled = s.autofilled;
  let derived = s.derived;
  let filled = 0;
  const put = (label: string, value: string | undefined) => {
    if (!value || !have.has(label)) return;
    values[label] = value;
    derived = without(derived, label);
    autofilled = without(autofilled, label);
    filled++;
  };

  put("Case number", d.caseNumber);
  for (const l of PLAINTIFF_LABELS) put(l, d.plaintiff);
  for (const l of DEFENDANT_LABELS) put(l, d.defendant);

  // Only our courthouses; an old GTAW number (26GJ…) leaves the field alone.
  put("Courthouse", courthouseFor(d.caseNumber)?.name);
  const div = divisionFor(d);
  put("Division", div);
  put("Court division", div ? titleWords(div.replace(/ DIVISION$/, "")) : undefined);
  if (d.plaintiff) put("Plaintiff label", plural(d.plaintiff) ? "Plaintiffs" : "Plaintiff");
  if (d.defendant) put("Defendant label", plural(d.defendant) ? "Defendants" : "Defendant");

  for (const l of FILED_LABELS) put(l, d.filed);
  if (d.nextDate && /judg/i.test(d.nextEvent || "")) {
    put("Judgement", d.nextDate);
    put("Judgment date", d.nextDate);
  }
  if (d.nextDate && /trial/i.test(d.nextEvent || "")) put("Trial date", d.nextDate);

  return { state: filled ? { values, autofilled, derived } : s, filled };
}

/**
 * The docket patch for "Save to docket": the case number plus whatever the form
 * knows about the case. Miscellaneous and Additional Templates forms never set a court from the form.
 */
export function formToDocketPatch(
  form: Pick<FormDef, "id" | "court">,
  entries: Entry[],
  values: Values,
): { patch: Partial<Docket> & { caseNumber: string } } | { error: string } {
  const num = (str(values["Case number"]) || "").trim();
  if (!num || /XXX|#/.test(num)) return { error: "Enter the case number first." };
  const have = labelsOf(entries, values);
  const pick = (labels: string[]) => {
    const hit = labels.find((l) => have.has(l) && str(values[l]));
    return hit ? str(values[hit]) : undefined;
  };
  const patch: Partial<Docket> & { caseNumber: string } = { caseNumber: num };
  const plaintiff = pick(PLAINTIFF_LABELS);
  const defendant = pick(DEFENDANT_LABELS);
  const filed = pick(FILED_LABELS);
  if (plaintiff) patch.plaintiff = plaintiff;
  if (defendant) patch.defendant = defendant;
  if (filed) patch.filed = filed;
  // The case number's own code says which division it is; the form's court is only a fallback.
  const div = divisionFor({ caseNumber: num }) || str(values.Division);
  if (div) patch.court = DIVISION_COURTS[div] || form.court;
  else if (form.court !== GENERAL_COURT && form.court !== "Additional Templates") patch.court = form.court;
  const judgement = str(values.Judgement) || str(values["Judgment date"]);
  const trial = str(values["Trial date"]);
  if (judgement) {
    patch.nextEvent = "Judgement";
    patch.nextDate = judgement;
  } else if (trial) {
    patch.nextEvent = "Trial";
    patch.nextDate = trial;
  }
  if (/judge?ment/i.test(form.id) && !/schedule|notice-of-trial/.test(form.id)) patch.status = "Closed";
  return { patch };
}

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

/* ------------------------------------------------------------ drafts */

/** Last open form id, or "jap" (restored when the app opens with no hash). */
export const LAST_FORM_KEY = "lawapp_last_form";
/** `{formId: [collapsed section names]}`. */
export const COLLAPSED_KEY = "lawapp_collapsed";

export function draftKey(formId: string): string {
  return "lawapp_draft_" + formId;
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isItem(v)) {
    for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  }
  return out;
}

/** The stored draft for a form; an invalid one is discarded and its key removed. */
export function readDraft(kv: KV, formId: string): FormState | null {
  const key = draftKey(formId);
  const raw = readJson<unknown>(kv, key);
  if (raw === null) return null;
  if (!isItem(raw) || !isItem((raw as Record<string, unknown>).values)) {
    kv.remove(key);
    return null;
  }
  const d = raw as Record<string, unknown>;
  return { values: d.values as Values, autofilled: stringMap(d.autofilled), derived: stringMap(d.derived) };
}

/** Store a form's draft. Failures are ignored (design §Error handling: draft saves are best-effort). */
export function writeDraft(kv: KV, formId: string, s: FormState): void {
  try {
    writeJson(kv, draftKey(formId), { values: s.values, autofilled: s.autofilled, derived: s.derived });
  } catch {
    // already warned by writeJson
  }
}
