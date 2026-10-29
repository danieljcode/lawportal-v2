// Form state types, empty state, field-label groups, scope paths and walking helpers.

import { isObject } from "../storage";
import type { Entry, Field, Scalar, Values } from "../types";

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

export const isItem = isObject as (v: unknown) => v is Values;

export function itemsOf(scope: Values, block: string): Values[] | null {
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
export function updateAt(values: Values, path: ScopePath, fn: (scope: Values) => Values): Values | null {
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

export function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const copy = { ...map };
  delete copy[key];
  return copy;
}

/* ------------------------------------------------------------ walking */

export type Visit = (f: Field, scope: Values) => void;

/** Every field with the scope it lives in (block items are their own scope; conds share their parent's). */
export function eachField(entries: Entry[], scope: Values, fn: Visit): void {
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
export function cloneValues(v: Values): Values {
  const out: Values = {};
  for (const k of Object.keys(v)) {
    const x = v[k];
    out[k] = Array.isArray(x) ? x.map((item) => (isItem(item) ? cloneValues(item) : item)) : x;
  }
  return out;
}

export function labelsOf(entries: Entry[], values: Values): Set<string> {
  const have = new Set<string>();
  eachField(entries, values, (f) => have.add(f.label));
  return have;
}

export function str(v: Scalar | Values[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
