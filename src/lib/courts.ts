// FreestyleRP's courthouses and case-number shape, in one place (LP-68).
//
// FreestyleRP has no official court details yet, so these are generic: one
// courthouse, Superior Court (SC). Real values go here, and nowhere else.
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

/**
 * The courthouse code the court forms' case-number patterns still carry after
 * the year (`YYGJCR00XXX`, from the reference forms). It's replaced with
 * DEFAULT_COURTHOUSE's code when a pattern is built. LP-69 regenerates the
 * forms without it, and then this goes.
 */
export const TEMPLATE_COURTHOUSE_CODE = "GJ";

/**
 * The courthouse named by a case number, from the two letters after the year;
 * undefined when they aren't one of ours (old GTAW numbers such as 26GJCR00147
 * are left as filed).
 */
export function courthouseFor(caseNumber: string | undefined): Courthouse | undefined {
  const m = /^\d{2}([A-Z]{2})/i.exec(caseNumber || "");
  return m ? COURTHOUSES.find((c) => c.code === m[1].toUpperCase()) : undefined;
}

/**
 * Put our courthouse into a form's case-number pattern in place of the forms'
 * own code (`YYGJCR00XXX` → `YYSCCR00XXX`). Patterns for other courts
 * (`YYSCWC…`, `YYAPCR…`) don't carry that code and are left alone.
 */
export function withCourthouse(pattern: string, courthouse: Courthouse = DEFAULT_COURTHOUSE): string {
  return pattern.startsWith("YY" + TEMPLATE_COURTHOUSE_CODE) ? "YY" + courthouse.code + pattern.slice(4) : pattern;
}
