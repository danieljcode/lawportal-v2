// Docket fields (split out of dockets.ts in LP-4): what a case on a docket holds,
// how it's cleaned and sorted, and the division in its case number. Pure: used by
// the case store (cases.ts) and the docket view over it (dockets.ts).

import { DIVISION_COURTS } from "./courts";
import { safeLink } from "./exhibits";
import { isId, ISO_DATE_RE, ISO_TIME_RE, newId } from "./storage";
import type { Docket, DocketStatus } from "./types";

/** Where each character's docket was saved before LP-4 (the cases migration reads and removes these). */
export const DOCKETS_PREFIX = "lawapp_dockets_";

export const STATUSES: readonly DocketStatus[] = ["Open", "Awaiting arguments", "Awaiting judgement", "Closed"];

export interface DocketField {
  key: Exclude<keyof Docket, "id" | "updated">;
  label: string;
  required?: boolean;
  type?: "date" | "url";
  options?: readonly string[];
  hint?: string;
  multiline?: boolean;
}

export const FIELDS: readonly DocketField[] = [
  { key: "caseNumber", label: "Case number", required: true },
  { key: "plaintiff", label: "Plaintiff / petitioner" },
  { key: "defendant", label: "Defendant / respondent" },
  { key: "court", label: "Court / division" },
  { key: "filed", label: "Filed on", type: "date" },
  { key: "status", label: "Status", options: STATUSES },
  { key: "nextEvent", label: "Next event", hint: "e.g. Openings due, Judgement" },
  { key: "nextDate", label: "Next date", type: "date" },
  { key: "link", label: "Forum thread", type: "url" },
  { key: "notes", label: "Notes", multiline: true },
];

/** Litigation codes inside a case number (90SCCR00147 → CR). */
export const DIVISION_CODES: Readonly<Record<string, string>> = {
  CR: "CRIMINAL DIVISION",
  CC: "CIVIL DIVISION",
  TC: "TRAFFIC DIVISION",
  SM: "SMALL CLAIMS DIVISION",
};

/**
 * A case's division: from the code in its number, otherwise from the court text
 * saved on the docket, either a FreestyleRP court name ("San Andreas Criminal
 * Court") or one saved before LP-69 ("…- Criminal Division").
 */
export function divisionFor(d: { caseNumber?: string; court?: string }): string | undefined {
  const m = /^\d{2}[A-Z]{2}(CR|CC|TC|SM)/i.exec(d.caseNumber || "");
  if (m) return DIVISION_CODES[m[1].toUpperCase()];
  const court = (d.court || "").toUpperCase();
  return Object.values(DIVISION_CODES).find(
    (name) => court.includes(name) || court === (DIVISION_COURTS[name] || "").toUpperCase(),
  );
}

/** The longest a docket or case field can be; the editors' boxes stop there too (LP-151). */
export const MAX_TEXT = 4000;

/** Normalise an untrusted docket entry (imports and sync are never trusted). */
export function clean(input: unknown): Docket {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = { id: isId(d.id) ? d.id : newId() };
  for (const f of FIELDS) {
    const v = d[f.key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[f.key] = s.slice(0, MAX_TEXT);
  }
  // Only real web links: an imported file could otherwise plant a javascript: link.
  if (out.link && !safeLink(out.link)) delete out.link;
  if (!(STATUSES as readonly string[]).includes(out.status)) out.status = STATUSES[0];
  if (out.nextDate && !ISO_DATE_RE.test(out.nextDate)) delete out.nextDate;
  if (out.filed && !ISO_DATE_RE.test(out.filed)) delete out.filed;
  out.updated = typeof d.updated === "string" && ISO_TIME_RE.test(d.updated) ? d.updated : new Date().toISOString();
  return out as unknown as Docket;
}

/** Open cases first, then by next date (soonest first, none last), then most recently updated. */
export function compare(a: Docket, b: Docket): number {
  const ca = a.status === "Closed";
  const cb = b.status === "Closed";
  if (ca !== cb) return ca ? 1 : -1;
  const da = a.nextDate || "9";
  const db = b.nextDate || "9";
  if (da !== db) return da < db ? -1 : 1;
  return a.updated < b.updated ? 1 : -1;
}
