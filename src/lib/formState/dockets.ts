// Loading a docket case into a form, and a form's case into a docket.

import { courthouseFor, DIVISION_COURTS, GENERAL_COURT } from "../courts";
import { divisionFor } from "../dockets";
import type { Docket, Entry, FormDef, Values } from "../types";
import { DEFENDANT_LABELS, FILED_LABELS, type FormState, labelsOf, PLAINTIFF_LABELS, str, without } from "./state";

/* ------------------------------------------------------------ dockets */

export function titleWords(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** More than one name ("A and B", "A, B") reads as plural. */
export function plural(names: string | undefined): boolean {
  return /,|\band\b|&/i.test(names || "");
}

/** True when the form has a field with this label (anywhere, including block items). */
export function hasField(entries: Entry[], values: Values, label: string): boolean {
  return labelsOf(entries, values).has(label);
}

/**
 * Put a docket entry's details into whichever of the matching fields the form
 * has (top level), clearing their derived/autofilled marks. The caller then runs
 * materializeBlocks → applyPrefills (a loaded judgement date reflows a schedule).
 */
export function docketToForm(entries: Entry[], s: FormState, d: Docket): { state: FormState; filled: number } {
  const have = labelsOf(entries, s.values);
  const values: Values = { ...s.values };
  let autofilled = s.autofilled;
  let derived = s.derived;
  let filled = 0;
  const put = (label: string, value: string | undefined) => {
    if (!value || !have.has(label)) return;
    values[label] = value;
    derived = without(derived, label);
    autofilled = without(autofilled, label);
    filled++;
  };

  put("Case number", d.caseNumber);
  for (const l of PLAINTIFF_LABELS) put(l, d.plaintiff);
  for (const l of DEFENDANT_LABELS) put(l, d.defendant);

  // Only our courthouses; an old number from the reference forms (26GJ…) leaves the field alone.
  put("Courthouse", courthouseFor(d.caseNumber)?.name);
  const div = divisionFor(d);
  put("Division", div);
  put("Court division", div ? titleWords(div.replace(/ DIVISION$/, "")) : undefined);
  // The judge templates' court line (LP-90); no other form has this label.
  put("Court name", d.court ? d.court.toUpperCase() : undefined);
  if (d.plaintiff) put("Plaintiff label", plural(d.plaintiff) ? "Plaintiffs" : "Plaintiff");
  if (d.defendant) put("Defendant label", plural(d.defendant) ? "Defendants" : "Defendant");

  for (const l of FILED_LABELS) put(l, d.filed);
  if (d.nextDate && /judg/i.test(d.nextEvent || "")) {
    put("Judgement", d.nextDate);
    put("Judgment date", d.nextDate);
  }
  if (d.nextDate && /trial/i.test(d.nextEvent || "")) put("Trial date", d.nextDate);

  return { state: filled ? { values, autofilled, derived } : s, filled };
}

/**
 * The docket patch for "Save to docket": the case number plus whatever the form
 * knows about the case. Miscellaneous and Additional Templates forms never set a court from the form.
 */
export function formToDocketPatch(
  form: Pick<FormDef, "id" | "court">,
  entries: Entry[],
  values: Values,
): { patch: Partial<Docket> & { caseNumber: string } } | { error: string } {
  const num = (str(values["Case number"]) || "").trim();
  if (!num || /XXX|#/.test(num)) return { error: "Enter the case number first." };
  const have = labelsOf(entries, values);
  const pick = (labels: string[]) => {
    const hit = labels.find((l) => have.has(l) && str(values[l]));
    return hit ? str(values[hit]) : undefined;
  };
  const patch: Partial<Docket> & { caseNumber: string } = { caseNumber: num };
  const plaintiff = pick(PLAINTIFF_LABELS);
  const defendant = pick(DEFENDANT_LABELS);
  const filed = pick(FILED_LABELS);
  if (plaintiff) patch.plaintiff = plaintiff;
  if (defendant) patch.defendant = defendant;
  if (filed) patch.filed = filed;
  // The case number's own code says which division it is; the form's court is only a fallback.
  const div = divisionFor({ caseNumber: num }) || str(values.Division);
  if (div) patch.court = DIVISION_COURTS[div] || form.court;
  else if (form.court !== GENERAL_COURT && form.court !== "Additional Templates") patch.court = form.court;
  const judgement = str(values.Judgement) || str(values["Judgment date"]);
  const trial = str(values["Trial date"]);
  if (judgement) {
    patch.nextEvent = "Judgement";
    patch.nextDate = judgement;
  } else if (trial) {
    patch.nextEvent = "Trial";
    patch.nextDate = trial;
  }
  if (/judge?ment/i.test(form.id) && !/schedule|notice-of-trial/.test(form.id)) patch.status = "Closed";
  return { patch };
}
