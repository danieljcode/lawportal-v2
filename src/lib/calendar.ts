// The month calendar (LP-231): a game month's open deadlines, hearings and dated
// next actions, by day. Deadlines and hearings are the same data (LP-18); a label
// that reads like a court date counts as a hearing. My work follows the home
// screen's work list (LP-171): deadlines on the character's cases and actions
// given to them. Pure: no storage.

import { isMember } from "./cases";
import type { Case } from "./types";

export type CalendarKind = "deadline" | "hearing" | "action";

export interface CalendarEntry {
  key: string;
  kind: CalendarKind;
  /** In-game date, YYYY-MM-DD. */
  date: string;
  title: string;
  case: Case;
}

export const KIND_NAMES: Record<CalendarKind, string> = {
  deadline: "Deadline",
  hearing: "Hearing",
  action: "Next action",
};

const HEARING_RE = /hearing|trial|arraign|sentenc|court date|appearance|ceremony/i;

export const calendarKind = (label: string): CalendarKind => (HEARING_RE.test(label) ? "hearing" : "deadline");

const ORDER: Record<CalendarKind, number> = { hearing: 0, deadline: 1, action: 2 };

/** "1990-11": the month's entries by date, each day hearings first, then deadlines, then actions. */
export function monthEntries(
  cases: readonly Case[],
  charId: string | null,
  month: string,
): Map<string, CalendarEntry[]> {
  const out: CalendarEntry[] = [];
  const inMonth = (date: string) => date.slice(0, 7) === month;
  for (const c of cases) {
    if (!charId || isMember(c, charId)) {
      for (const d of c.deadlines) {
        if (d.done || !inMonth(d.date)) continue;
        out.push({ key: "d:" + c.id + ":" + d.id, kind: calendarKind(d.label), date: d.date, title: d.label, case: c });
      }
    }
    for (const a of c.actions || []) {
      if (a.done || !a.due || !inMonth(a.due) || (charId && a.owner !== charId)) continue;
      out.push({ key: "a:" + c.id + ":" + a.id, kind: "action", date: a.due, title: a.title, case: c });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : ORDER[a.kind] - ORDER[b.kind]));
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of out) byDay.set(e.date, [...(byDay.get(e.date) || []), e]);
  return byDay;
}
