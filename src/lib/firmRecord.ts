// The Firm Record (LP-92): closed cases by outcome, for the firm and each lawyer,
// for a matter type and date range. A win rate is wins out of the cases won or
// lost; settled, dismissed, plea deals and withdrawn cases don't count either way.
// Judges aren't listed as lawyers, though their cases count for the firm. Pure.

import { members } from "./cases";
import { isJudge } from "./courtDocket";
import { formatDay } from "./deadlines";
import { DIVISION_CODES, divisionFor } from "./docketFields";
import { OUTCOME_LABELS } from "./outcomes";
import type { Case, Character, OutcomeResult } from "./types";

export const OUTCOME_ORDER = Object.keys(OUTCOME_LABELS) as OutcomeResult[];

/** "Criminal", "Civil", "Traffic" or "Small claims", from the division. */
const matterName = (division: string) => {
  const word = division.replace(/ DIVISION$/, "").toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
};
export const MATTERS: readonly string[] = [...Object.values(DIVISION_CODES).map(matterName), "Other"];

export function matterOf(c: Pick<Case, "caseNumber" | "court">): string {
  const division = divisionFor(c);
  return division ? matterName(division) : "Other";
}

export type Tally = Record<OutcomeResult, number> & { cases: number };

const emptyTally = (): Tally => ({ cases: 0, won: 0, lost: 0, settled: 0, dismissed: 0, plea: 0, withdrawn: 0 });

/** Whole percent of the cases won or lost; null when none were. */
export function winRate(t: Tally): number | null {
  const decided = t.won + t.lost;
  return decided ? Math.round((t.won / decided) * 100) : null;
}

export const winRateText = (t: Tally) => {
  const rate = winRate(t);
  return rate === null ? "–" : rate + "%";
};

export interface RecordFilter {
  matter?: string;
  /** Game dates, both inclusive. */
  from?: string;
  to?: string;
}

export interface LawyerRecord {
  id: string;
  name: string;
  tally: Tally;
  /** Latest outcome first. */
  cases: Case[];
}

export interface FirmRecord {
  firm: Tally;
  lawyers: LawyerRecord[];
  /** Closed cases of this matter type with no outcome yet; dates don't apply. */
  unrecorded: Case[];
}

export function firmRecord(cases: readonly Case[], people: readonly Character[], f: RecordFilter = {}): FirmRecord {
  const closed = cases.filter((c) => c.status === "Closed" && (!f.matter || matterOf(c) === f.matter));
  const firm = emptyTally();
  const lawyers = new Map<string, LawyerRecord>();
  const counted = closed
    .filter((c) => c.outcome && (!f.from || c.outcome.date >= f.from) && (!f.to || c.outcome.date <= f.to))
    .sort((a, b) => (a.outcome!.date < b.outcome!.date ? 1 : a.outcome!.date > b.outcome!.date ? -1 : 0));
  for (const c of counted) {
    const result = c.outcome!.result;
    firm.cases++;
    firm[result]++;
    for (const id of members(c)) {
      const person = people.find((p) => p.id === id);
      if (isJudge(person)) continue;
      let record = lawyers.get(id);
      if (!record) {
        record = { id, name: person?.name || "Unknown character", tally: emptyTally(), cases: [] };
        lawyers.set(id, record);
      }
      record.tally.cases++;
      record.tally[result]++;
      record.cases.push(c);
    }
  }
  return {
    firm,
    lawyers: [...lawyers.values()].sort((a, b) => b.tally.cases - a.tally.cases || a.name.localeCompare(b.name)),
    unrecorded: closed.filter((c) => !c.outcome),
  };
}

const tallyLine = (t: Tally) =>
  [
    t.cases + (t.cases === 1 ? " case" : " cases"),
    ...OUTCOME_ORDER.filter((r) => t[r]).map((r) => t[r] + " " + OUTCOME_LABELS[r].toLowerCase()),
    "win rate " + winRateText(t),
  ].join(", ");

/** The record as a few lines of plain text, for pasting. */
export function recordSummary(firmName: string, r: FirmRecord, f: RecordFilter = {}): string {
  const scope = [f.matter, f.from ? "from " + formatDay(f.from) : "", f.to ? "to " + formatDay(f.to) : ""].filter(
    Boolean,
  );
  return [
    firmName + " record" + (scope.length ? " (" + scope.join(", ") + ")" : ""),
    "The firm: " + tallyLine(r.firm),
    ...r.lawyers.map((l) => l.name + ": " + tallyLine(l.tally)),
  ].join("\n");
}
