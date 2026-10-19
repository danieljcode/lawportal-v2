// FreestyleRP wording for the directory forms (LP-69), applied by
// `npm run port-forms` so forms.json holds exactly what gets posted: no
// translation at runtime. Court names here; courthouses and the case-number
// shape come from src/lib/courts.ts. After changing either, run port-forms.
import {
  APPELLATE_COURT,
  COURTHOUSES,
  DEFAULT_COURTHOUSE,
  DIVISION_COURTS,
  GENERAL_COURT,
  SUPREME_COURT,
} from "../src/lib/courts.ts";

/** The reference forms' sidebar `court` values → FreestyleRP court names. */
export const COURT_NAMES = {
  "Superior Court of San Andreas - Criminal Division": DIVISION_COURTS["CRIMINAL DIVISION"],
  "Superior Court of San Andreas - Civil Division": DIVISION_COURTS["CIVIL DIVISION"],
  "Superior Court of San Andreas - Traffic Division": DIVISION_COURTS["TRAFFIC DIVISION"],
  "Superior Court of San Andreas - Small Claims Division": DIVISION_COURTS["SMALL CLAIMS DIVISION"],
  "Appellate Court of San Andreas": APPELLATE_COURT,
  "Supreme Court of San Andreas": SUPREME_COURT,
  Miscellaneous: GENERAL_COURT,
};

/**
 * Court phrases as they appear inside the template HTML (not the same strings
 * as COURT_NAMES). Order matters: the most specific come first, so a general
 * "Superior Court of San Andreas" match never swallows an Appellate or Supreme one.
 */
const COURT_PHRASES = [
  [/APPELLATE COURT OF SAN ANDREAS/gi, "SAN ANDREAS APPELLATE COURT"],
  [/SUPREME COURT OF SAN ANDREAS/gi, "SAN ANDREAS SUPREME COURT"],
  // Also matches the &nbsp; variant.
  [/SUPERIOR(?:&nbsp;|\s)+COURT OF THE STATE OF SAN ANDREAS/gi, "SAN ANDREAS COURT"],
  [/SUPERIOR(?:&nbsp;|\s)+COURT OF SAN ANDREAS/gi, "SAN ANDREAS COURT"],
  [/\bSmall Claims Court\b/gi, "San Andreas Small Claims Court"],
];

/** The reference forms' GTAW courthouse code, as used in their case numbers. */
const GTAW_CODE = "GJ";
const DIVISIONS = "(?=CR|CC|TC|SM|XX|<)";

function titleCase(s) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** The GTAW courthouses → ours (src/lib/courts.ts). */
function courthouses(html) {
  const code = DEFAULT_COURTHOUSE.code;
  const names = COURTHOUSES.map((c) => c.name);
  return (
    html
      // Case-number prefills and fallbacks: YYGJCR00XXX, ##GJCR#####, --GJCC-----.
      .replace(new RegExp(`(YY|##|--)${GTAW_CODE}${DIVISIONS}`, "g"), `$1${code}`)
      // A worked example with a real GTAW year (26GJSM00001): in-game year 1990.
      .replace(new RegExp(`\\b\\d{2}${GTAW_CODE}${DIVISIONS}`, "g"), `90${code}`)
      .replace(
        /\{\{Courthouse:select:[^|}]*\|[^}]*\}\}/g,
        `{{Courthouse:select:${names.join(";")}|${DEFAULT_COURTHOUSE.name}}}`,
      )
      .replace(/Greg E\.? Joplin Court ?house/gi, (m) =>
        m === m.toUpperCase() ? DEFAULT_COURTHOUSE.name : titleCase(DEFAULT_COURTHOUSE.name),
      )
  );
}

/** A reference form with FreestyleRP court names, wording and courthouses. */
export function toFreestyle(form) {
  let html = form.html;
  for (const [pattern, replacement] of COURT_PHRASES) html = html.replace(pattern, replacement);
  return { ...form, court: COURT_NAMES[form.court] || form.court, html: courthouses(html) };
}
