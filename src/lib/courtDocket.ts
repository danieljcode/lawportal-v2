// The Court Docket (LP-91): the cases before a judge. Each case's standing comes
// from what the Case File already holds: Closed and Awaiting judgement from its
// status, Scheduled when a date lies ahead, Pending otherwise. Its next date is
// the soonest of its open deadlines and its Next date, today or later (in-game).
// Pure: no storage.

import { isMember } from "./cases";
import type { Case, Character } from "./types";

export const DOCKET_STANDINGS = ["Pending", "Scheduled", "Under advisement", "Closed"] as const;
export type DocketStanding = (typeof DOCKET_STANDINGS)[number];

const BENCH_TITLE = /\b(judge|justice|commissioner|magistrate)\b/i;
const LAWYER_TITLE = /\b(attorney|lawyer|counsel|prosecutor|defender|solicitor|barrister)\b/i;

/** Sits on the bench, by title: a Deputy Attorney in the Department of Justice doesn't. */
export function isJudge(c: Pick<Character, "title"> | null | undefined): boolean {
  const title = c?.title || "";
  return BENCH_TITLE.test(title) && !LAWYER_TITLE.test(title);
}

export interface NextDate {
  date: string;
  label: string;
}

export interface DocketRow {
  case: Case;
  standing: DocketStanding;
  /** Null when nothing is dated ahead. */
  next: NextDate | null;
  /** Under advisement: the judge owes a ruling. */
  awaitingRuling: boolean;
}

export function nextDate(c: Case, today: string): NextDate | null {
  const dates: NextDate[] = c.deadlines.filter((d) => !d.done).map((d) => ({ date: d.date, label: d.label }));
  if (c.nextDate) dates.push({ date: c.nextDate, label: c.nextEvent || "Next date" });
  return (
    dates.filter((d) => d.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null
  );
}

function standingOf(c: Case, next: NextDate | null): DocketStanding {
  if (c.status === "Closed") return "Closed";
  if (c.status === "Awaiting judgement") return "Under advisement";
  return next ? "Scheduled" : "Pending";
}

/** With no date to go by, what the judge owes comes first and what's finished last. */
const UNDATED_ORDER: readonly DocketStanding[] = ["Under advisement", "Pending", "Closed"];

/** The judge's cases, filtered by standing when one is given: soonest next date first, undated last. */
export function courtDocket(
  cases: readonly Case[],
  judgeId: string,
  today: string,
  standing?: DocketStanding,
): DocketRow[] {
  return cases
    .filter((c) => isMember(c, judgeId))
    .map((c) => {
      const next = c.status === "Closed" ? null : nextDate(c, today);
      const s = standingOf(c, next);
      return { case: c, standing: s, next, awaitingRuling: s === "Under advisement" };
    })
    .filter((row) => !standing || row.standing === standing)
    .sort((a, b) => {
      if (!a.next || !b.next) {
        if (a.next || b.next) return a.next ? -1 : 1;
        return (
          UNDATED_ORDER.indexOf(a.standing) - UNDATED_ORDER.indexOf(b.standing) ||
          a.case.caseNumber.localeCompare(b.case.caseNumber)
        );
      }
      return a.next.date < b.next.date ? -1 : a.next.date > b.next.date ? 1 : 0;
    });
}
