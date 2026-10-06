import type { FormDef } from "@/lib/types";
import forms from "./forms.json";
import { EXTRA_FORMS } from "./extra-forms";

/** Every form: the 39 directory forms in directory order, then the Additional Templates. */
export const ALL_FORMS: FormDef[] = [...(forms as FormDef[]), ...EXTRA_FORMS];

const BY_ID = new Map(ALL_FORMS.map((f) => [f.id, f]));

export function getForm(id: string): FormDef | undefined {
  return BY_ID.get(id);
}

/** Distinct directory courts in first-appearance order (feeds the docket court datalist). */
export const COURTS: string[] = [...new Set(ALL_FORMS.map((f) => f.court))].filter(
  (c) => c !== "Additional Templates",
);
