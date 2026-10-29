// The courthouses and case-number shape, in one place (LP-68).
//
// There are no official court details yet, so these are generic: one
// courthouse, Superior Court (SC). Real values go here, and nowhere else; then
// run `npm run port-forms`, which writes them into the forms' Courthouse
// dropdowns and case-number patterns (scripts/court-wording.mjs).
// Division codes (CR, CC, TC, SM…) stay in dockets.ts DIVISION_CODES.
//
// A case number is: 2-digit in-game year + courthouse code + division code +
// number, e.g. 90SCCR00147 (1990, Superior Court, criminal). Client and test
// code only; no imports, so scripts can load it too.

export interface Courthouse {
  /** The two letters after the year in a case number. */
  code: string;
  /** As written on a filing's COURTHOUSE NAME line. */
  name: string;
}

export const COURTHOUSES: readonly Courthouse[] = [{ code: "SC", name: "SUPERIOR COURT" }];

/** The courthouse new case numbers use. */
export const DEFAULT_COURTHOUSE: Courthouse = COURTHOUSES[0];

/** Court names, as the sidebar groups forms and dockets record a case's court. */
export const DIVISION_COURTS: Readonly<Record<string, string>> = {
  "CRIMINAL DIVISION": "San Andreas Criminal Court",
  "CIVIL DIVISION": "San Andreas Civil Court",
  "TRAFFIC DIVISION": "San Andreas Traffic Court",
  "SMALL CLAIMS DIVISION": "San Andreas Small Claims Court",
};
export const APPELLATE_COURT = "San Andreas Appellate Court";
export const SUPREME_COURT = "San Andreas Supreme Court";
/** Forms that aren't tied to one court (the reference's "Miscellaneous"). */
export const GENERAL_COURT = "San Andreas Court";

/**
 * The courthouse named by a case number, from the two letters after the year;
 * undefined when they aren't one of ours (old numbers from the reference forms such as 26GJCR00147
 * are left as filed).
 */
export function courthouseFor(caseNumber: string | undefined): Courthouse | undefined {
  const m = /^\d{2}([A-Z]{2})/i.exec(caseNumber || "");
  return m ? COURTHOUSES.find((c) => c.code === m[1].toUpperCase()) : undefined;
}
