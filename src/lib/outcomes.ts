// How a case ended (LP-92): the outcome, a note and the in-game date, on the case.
// Only a Closed case counts towards the Firm Record (firmRecord.ts); one that's
// reopened keeps its outcome for when it closes again. Pure: no storage.

import { ISO_DATE_RE, text } from "./storage";
import type { CaseOutcome, OutcomeResult } from "./types";

export const OUTCOME_LABELS: Readonly<Record<OutcomeResult, string>> = {
  won: "Won",
  lost: "Lost",
  settled: "Settled",
  dismissed: "Dismissed",
  plea: "Plea deal",
  withdrawn: "Withdrawn",
};

/** Normalise an untrusted outcome; null without a known result and a game date. */
export function cleanOutcome(input: unknown): CaseOutcome | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.result !== "string" || !Object.hasOwn(OUTCOME_LABELS, o.result)) return null;
  if (typeof o.date !== "string" || !ISO_DATE_RE.test(o.date)) return null;
  const note = text(o.note, 1000);
  return { result: o.result as OutcomeResult, date: o.date, ...(note ? { note } : {}) };
}
