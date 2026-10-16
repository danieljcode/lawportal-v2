// FreestyleRP settings (LP-70). The app is FreestyleRP-only: there's no server
// choice. Court names, courthouses and the case-number pattern are in courts.ts.
//
// FreestyleRP is set 36 years back, so a real 2026 reads as 1990 and rolls over
// to 1991 on the next real New Year. gameDate() is fed into the optional `now`
// seam of template.ts / formState.ts, so every date a form produces (Today,
// Auto, prefills, the case-number year) is in-game.

/** Years added to the real year. */
export const YEAR_OFFSET = -36;

/**
 * The same calendar day in the in-game year (UTC). Month and day are kept;
 * Feb 29 of a leap year that maps to a non-leap year becomes Mar 1, which is
 * the native Date behaviour we rely on.
 */
export function gameDate(real: Date = new Date(), offset: number = YEAR_OFFSET): Date {
  const d = new Date(real.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + offset);
  return d;
}
