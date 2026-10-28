// Compiling a form's template for the editor and for filing history (LP-136):
// the same tree, so a blank Case number renders the same pattern in both.

import type { Entry, FormDef, Node, Tree } from "../types";
import { compile, fields } from "./parse";
import { caseNumberPattern } from "./prefill";

export type Compiled = { tree: Tree; entries: Entry[]; error: null } | { tree: null; entries: Entry[]; error: string };

/**
 * Rewrite every "Case number" field that carries a prefill so the editor box
 * starts EMPTY while the in-game pattern becomes the field's fallback. The
 * fallback is what `render` emits for a blank field (so the pattern still appears
 * in every output) and what `FieldInput` shows as the input placeholder. Dropping
 * the prefill stops `applyPrefills` from pre-filling the value, so the box is
 * visually empty until typed. The pattern names our courthouse (src/lib/courts.ts), e.g. `90SCCR00XXX`.
 *
 * Fields are shared by reference between the tree and `fields(tree)`, so mutating
 * the field objects here is enough. Extra Templates use `{{Case number|____}}`
 * with no prefill and are left untouched (they already start empty and carry no
 * YY… pattern).
 */
function rewriteCaseNumbers(nodes: Node[], now: Date): void {
  for (const n of nodes) {
    if (n.kind === "field") {
      if (n.field.label === "Case number" && n.field.prefill) {
        n.field.fallback = caseNumberPattern(n.field, now);
        n.field.prefill = undefined;
      }
    } else if (n.kind === "block" || n.kind === "cond") {
      rewriteCaseNumbers(n.children, now);
    }
  }
}

/** `now` is the real time the form was opened or filed; the case-number year is its game year. */
export function compileForm(form: FormDef, now: Date): Compiled {
  try {
    const tree = compile(form.html);
    rewriteCaseNumbers(tree.children, now);
    return { tree, entries: fields(tree), error: null };
  } catch (err) {
    console.error("[form] couldn't compile", form.id, err);
    return { tree: null, entries: [], error: err instanceof Error ? err.message : String(err) };
  }
}
