import type { FormInfo } from "@/lib/types";
import index from "./form-index.json";

/**
 * Every form's id, court, section and title, in ALL_FORMS order, without the templates (LP-133): the
 * shell routes, titles and lists forms from this, so the templates (`@/data`) load with Court
 * Filings. form-index.json is written by tests/form-index.test.ts (`npx vitest run -u`).
 */
export const FORM_INDEX: FormInfo[] = index;

const BY_ID = new Map(FORM_INDEX.map((f) => [f.id, f]));

export function formInfo(id: string): FormInfo | undefined {
  return BY_ID.get(id);
}

/** Distinct directory courts in first-appearance order (feeds the docket court datalist). */
export const COURTS: string[] = [...new Set(FORM_INDEX.map((f) => f.court))].filter(
  (c) => c !== "Additional Templates",
);
