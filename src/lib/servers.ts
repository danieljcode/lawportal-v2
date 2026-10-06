// Server profiles (GTAW / FreestyleRP).
//
// A pure config module: no imports from components. A "server" bends two things
// about a filing — the calendar year (FreestyleRP is set 36 years back, so a
// real 2026 reads as 1990 and rolls over to 1991 on the next real New Year) and
// the court names (FreestyleRP uses generic "San Andreas" courts rather than the
// GTAW "Superior Court of the State of San Andreas" wording).
//
// The year is applied through getServerDate(), fed into the existing optional
// `now` seam of template.ts / formState.ts. The court names are transformed on
// the fly: mapCourt() for the sidebar/breadcrumb group strings and mapCourtHtml()
// for the phrases as they actually appear inside the form template HTML (those
// two string sets differ — see the ordered HTML phrase list below).

export type ServerId = "gtaw" | "freestyle";

export interface ServerProfile {
  id: ServerId;
  /** The visible label; the only place "GTAW" appears as a word. */
  name: string;
  /** Years added to the real year (0 for gtaw, -36 for freestyle). */
  yearOffset: number;
  /** Sidebar `court` value → replacement name (empty for gtaw = identity). */
  courtNames: Record<string, string>;
  /**
   * Adapt a case-number pattern (already year-expanded, e.g. `26GJCR00XXX`) for
   * this server. gtaw is the identity; freestyle strips the `GJ` prefix.
   */
  caseNumberTransform(pattern: string): string;
}

/**
 * Remove the literal `GJ` that immediately follows the leading 2-digit year of a
 * case-number pattern (e.g. `26GJCR00XXX` → `26CR00XXX`). The strip runs once at
 * the start and leaves the form's own division letters (CR/CC/TC/SM/…) and any
 * pattern without a `GJ` after the year (e.g. `26SCWC00XXX`) untouched.
 *
 * `GJ` = "Greg E Joplin", a GTAW-only courthouse code; FreestyleRP has no such
 * prefix, so it never appears in a FreestyleRP case number.
 */
export function stripGJ(pattern: string): string {
  return pattern.replace(/^(\d{2})GJ/i, "$1");
}

/** Sidebar/breadcrumb court values (from forms.json + extra-forms.ts) → FreestyleRP names. */
const FREESTYLE_COURT_NAMES: Record<string, string> = {
  "Superior Court of San Andreas - Criminal Division": "San Andreas Criminal Court",
  "Superior Court of San Andreas - Civil Division": "San Andreas Civil Court",
  "Superior Court of San Andreas - Traffic Division": "San Andreas Traffic Court",
  "Superior Court of San Andreas - Small Claims Division": "San Andreas Small Claims Court",
  "Appellate Court of San Andreas": "San Andreas Appellate Court",
  "Supreme Court of San Andreas": "San Andreas Supreme Court",
  Miscellaneous: "San Andreas Court",
  // "Additional Templates" is our own section; left as-is on both servers.
};

export const SERVERS: Record<ServerId, ServerProfile> = {
  // GTAW keeps the GJ (Greg Joplin) courthouse code → identity transform.
  gtaw: { id: "gtaw", name: "GTAW", yearOffset: 0, courtNames: {}, caseNumberTransform: (p) => p },
  // FreestyleRP has no GJ courthouse code → strip it from case numbers.
  freestyle: {
    id: "freestyle",
    name: "FreestyleRP",
    yearOffset: -36,
    courtNames: FREESTYLE_COURT_NAMES,
    caseNumberTransform: stripGJ,
  },
};

export const SERVER_ORDER: ServerId[] = ["gtaw", "freestyle"];
export const DEFAULT_SERVER: ServerId = "gtaw";

/** The localStorage key for the persisted default server (used when no character is active). */
export const SERVER_KEY = "lawapp_server";

function isServerId(id: unknown): id is ServerId {
  return id === "gtaw" || id === "freestyle";
}

/** The profile for an id; an unknown/absent id falls back to the default (gtaw). */
export function getServer(id: string | undefined | null): ServerProfile {
  return isServerId(id) ? SERVERS[id] : SERVERS[DEFAULT_SERVER];
}

/**
 * The same calendar day shifted by the profile's year offset (UTC). gtaw returns
 * an equivalent date unchanged; freestyle moves the year back 36 (2026 → 1990),
 * so it rolls over with the real New Year (2027-01-01 → 1991). Month and day are
 * preserved; Feb 29 of a leap year that maps to a non-leap year normalises to
 * Mar 1, which is the native Date behaviour we rely on.
 */
export function getServerDate(real: Date, profile: ServerProfile): Date {
  if (!profile.yearOffset) return new Date(real.getTime());
  const d = new Date(real.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + profile.yearOffset);
  return d;
}

/** The sidebar/breadcrumb court name for the active server (identity for gtaw). */
export function mapCourt(server: ServerProfile, court: string): string {
  return server.courtNames[court] || court;
}

/**
 * Ordered, case-insensitive phrase replacements for FreestyleRP, built from the
 * court wording that actually appears inside the form template HTML (which is NOT
 * the sidebar `court` strings — see the plan's N1 note). Order matters: the most
 * specific phrases come first so a general "Superior Court of San Andreas" match
 * never swallows an Appellate/Supreme phrase.
 */
const FREESTYLE_HTML_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Appellate / Supreme first (they are more specific than the "Superior Court" catch-alls).
  [/APPELLATE COURT OF SAN ANDREAS/gi, "SAN ANDREAS APPELLATE COURT"],
  [/SUPREME COURT OF SAN ANDREAS/gi, "SAN ANDREAS SUPREME COURT"],
  // Superior Court headers, longest wording first.
  // Matches "SUPERIOR COURT OF THE STATE OF SAN ANDREAS" and the &nbsp; variant.
  [/SUPERIOR(?:&nbsp;|\s)+COURT OF THE STATE OF SAN ANDREAS/gi, "SAN ANDREAS COURT"],
  [/SUPERIOR(?:&nbsp;|\s)+COURT OF SAN ANDREAS/gi, "SAN ANDREAS COURT"],
  // "Small Claims Court" → keep the division but prefix the state.
  [/\bSmall Claims Court\b/gi, "San Andreas Small Claims Court"],
];

/**
 * Transform the court phrases inside a form's template HTML for the active server.
 * gtaw returns the HTML unchanged; freestyle applies FREESTYLE_HTML_REPLACEMENTS.
 * Applied before compile so extracted placeholders/fallbacks reflect the mapping too.
 */
export function mapCourtHtml(server: ServerProfile, html: string): string {
  if (server.id === "gtaw") return html;
  let out = html;
  for (const [pattern, replacement] of FREESTYLE_HTML_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
