// Required fields (LP-87): which of a form's required fields are still empty,
// checked before a filing is copied or downloaded. Pure, no DOM.

import type { Entry, Scalar, Values } from "../types";
import { singular } from "./layout";

export interface MissingField {
  label: string;
  /** Where it sits, for the list: "" at the top, else e.g. "Defendant 2". */
  where: string;
  /** Input id key (the editor's `prefix + label`; slugId turns it into the element id). */
  key: string;
  /** The editor section it's in, so a jump can open it. */
  section: string;
}

/** The section name the editor uses before the first `{{-- Name}}` marker. */
const FIRST_SECTION = "Case details";

function isEmpty(v: Scalar | Values[] | undefined): boolean {
  return typeof v !== "string" || v.trim() === "";
}

/**
 * Every required field that's empty, in form order. Fields inside an optional
 * section that's switched off don't count; inside a repeatable block, each item
 * is checked. Tick boxes are never required.
 */
export function missingRequired(
  entries: Entry[],
  values: Values,
  required: readonly string[] | undefined,
): MissingField[] {
  const out: MissingField[] = [];
  if (!required || !required.length) return out;
  const want = new Set(required);
  let section = FIRST_SECTION;

  const walk = (list: Entry[], scope: Values, prefix: string, where: string) => {
    for (const e of list) {
      if ("section" in e) {
        section = e.section;
      } else if ("field" in e) {
        const f = e.field;
        if (want.has(f.label) && f.type !== "check" && isEmpty(scope[f.label])) {
          out.push({ label: f.label, where, key: prefix + f.label, section });
        }
      } else if ("cond" in e) {
        const on = scope["?" + e.cond.name];
        if (on === undefined ? e.cond.on : on) walk(e.fields, scope, prefix, where);
      } else {
        const name = e.block.name;
        const stored = scope["#" + name];
        const items = Array.isArray(stored) ? stored : [];
        const one = singular(name);
        items.forEach((item, i) => {
          // Item keys shadow outer ones, as in the renderer.
          const inner: Values = Object.create(scope);
          for (const k of Object.keys(item || {})) inner[k] = item[k];
          walk(e.fields, inner, prefix + name + i + "-", one + " " + (i + 1));
        });
      }
    }
  };
  walk(entries, values, "", "");
  return out;
}
