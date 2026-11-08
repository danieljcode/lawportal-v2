import type { FormDef } from "@/lib/types";
import forms from "./forms.json";
import { EXTRA_FORMS } from "./extra-forms";
import { myTemplateForm } from "./myTemplates";

/** Every form: the 39 directory forms in directory order, then the Additional Templates. */
export const ALL_FORMS: FormDef[] = [...(forms as FormDef[]), ...EXTRA_FORMS];

const BY_ID = new Map(ALL_FORMS.map((f) => [f.id, f]));

/** A form by id, the firm's own templates (LP-49) included. */
export function getForm(id: string): FormDef | undefined {
  return BY_ID.get(id) || myTemplateForm(id);
}
