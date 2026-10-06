// What every field component needs from FormView: the form's entries (for the
// prefill rules), the active character (for R6) and the one state-update callback.

import { createContext, useContext } from "react";
import type { FormState } from "@/lib/formState";
import type { Character, Entry } from "@/lib/types";

export interface FormCtx {
  /** Top-level entries of the form (fields(tree)). */
  entries: Entry[];
  character: Character | null;
  /** Every edit goes through here as an update-API call on the current state. */
  onState(fn: (s: FormState) => FormState): void;
  /** The (possibly server-offset) current date fed to Today/Auto buttons. */
  now: Date;
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
