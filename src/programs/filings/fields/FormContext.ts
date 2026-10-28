// What every field component needs from FormView: the form's entries (for the
// prefill rules), the active character (for R6) and the one state-update callback.

import { createContext, useContext } from "react";
import type { FormState } from "@/lib/formState";
import type { ExhibitRef } from "@/lib/exhibits";
import type { Character, Entry } from "@/lib/types";

/** A form field that can take inserted text (a citation from the Law Library, LP-16). */
export interface FieldTarget {
  label: string;
  /** Insert at the field's cursor, or in place of its selection. */
  insert(text: string): void;
}

export interface FormCtx {
  /** Top-level entries of the form (fields(tree)). */
  entries: Entry[];
  character: Character | null;
  /**
   * Every edit goes through here as an update-API call on the current state, and
   * is an undo step (LP-89). `key` (the input being typed in) groups typing into one step.
   */
  onState(fn: (s: FormState) => FormState, key?: string): void;
  /** The (possibly server-offset) current date fed to Today/Auto buttons. */
  now: Date;
  /** Labels the form requires (LP-87): empty ones are marked in the editor. */
  required: ReadonlySet<string>;
  /** The exhibits of the firm case with this form's case number (LP-13), for Insert exhibit. */
  exhibits: readonly ExhibitRef[];
  /** A text field was focused: it's where Insert citation goes (LP-16). */
  onFieldFocus(target: FieldTarget): void;
}

export const FormContext = createContext<FormCtx | null>(null);

export function useFormCtx(): FormCtx {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("Field components must be rendered inside FormView.");
  return ctx;
}

/** The reference input id rule: "f-" + the slugged prefix and label. */
export function slugId(s: string): string {
  return "f-" + s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}
