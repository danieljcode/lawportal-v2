// Saving and reading each form's draft, and the last-form and collapsed keys.

import { type KV, readJson, writeJson } from "../storage";
import type { Values } from "../types";
import { type FormState, isItem } from "./state";

/* ------------------------------------------------------------ drafts */

/** Last open form id, or "jap" (restored when the app opens with no hash). */
export const LAST_FORM_KEY = "lawapp_last_form";
/** `{formId: [collapsed section names]}`. */
export const COLLAPSED_KEY = "lawapp_collapsed";

export function draftKey(formId: string): string {
  return "lawapp_draft_" + formId;
}

export function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isItem(v)) {
    for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  }
  return out;
}

/** A saved draft (or draft snapshot, LP-89) as a FormState; null when it isn't one. */
export function toFormState(raw: unknown): FormState | null {
  if (!isItem(raw) || !isItem((raw as Record<string, unknown>).values)) return null;
  const d = raw as Record<string, unknown>;
  return { values: d.values as Values, autofilled: stringMap(d.autofilled), derived: stringMap(d.derived) };
}

/** The stored draft for a form; an invalid one is discarded and its key removed. */
export function readDraft(kv: KV, formId: string): FormState | null {
  const key = draftKey(formId);
  const raw = readJson<unknown>(kv, key);
  if (raw === null) return null;
  const state = toFormState(raw);
  if (!state) kv.remove(key);
  return state;
}

/** Store a form's draft. Failures are ignored (design §Error handling: draft saves are best-effort). */
export function writeDraft(kv: KV, formId: string, s: FormState): void {
  try {
    writeJson(kv, draftKey(formId), { values: s.values, autofilled: s.autofilled, derived: s.derived });
  } catch {
    // already warned by writeJson
  }
}
