// The update API: set values and conditions, add, remove and move repeatable items.

import { defaultItems, prefillDeps } from "../template";
import type { Entry, Values } from "../types";
import { swapCaseCode } from "./rules";
import { eachField, type FormState, isItem, itemsOf, type ScopePath, updateAt, without } from "./state";

/* ------------------------------------------------------------ update API */

export function materialize(entries: Entry[], scope: Values): Values {
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

export function editItems(
  s: FormState,
  path: ScopePath,
  block: string,
  fn: (items: Values[]) => Values[] | null,
): FormState {
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
