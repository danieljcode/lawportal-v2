// What needs attention (LP-171), for the home screen: court deadlines and
// hearings (LP-18), dated next actions (LP-170) and invoices still owed
// (LP-33), as one list. Overdue first, then soonest; on the same day a court
// date comes before an action, and an action before a bill.
//
// My work is the character's: deadlines on cases they work, actions given to
// them, and invoices on their cases. All firm work is everyone's. Dates are
// in-game (gameToday). Pure: no storage.

import { addDays, SOON_DAYS, UPCOMING_DAYS, upcoming } from "./deadlines";
import { isMember } from "./cases";
import { invoiceBalance, invoiceDue, receivables, type Invoice } from "./invoices";
import type { Case, CaseAction, Deadline } from "./types";

export type WorkKind = "deadline" | "action" | "invoice";

interface WorkBase {
  /** Unique in the list. */
  key: string;
  /** In-game date it's due. */
  date: string;
  overdue: boolean;
  /** Due within SOON_DAYS (or overdue). */
  soon: boolean;
}

export type WorkItem = WorkBase &
  (
    | { kind: "deadline"; case: Case; deadline: Deadline }
    | { kind: "action"; case: Case; action: CaseAction }
    | { kind: "invoice"; invoice: Invoice; case?: Case; balance: number }
  );

const ORDER: Record<WorkKind, number> = { deadline: 0, action: 1, invoice: 2 };

export interface WorkOptions {
  cases: readonly Case[];
  invoices: readonly Invoice[];
  /** The character whose work it is; null for the whole firm. */
  charId: string | null;
  today: string;
  /** How far ahead deadlines and actions are listed (overdue ones always are). */
  days?: number;
}

export function workItems({ cases, invoices, charId, today, days = UPCOMING_DAYS }: WorkOptions): WorkItem[] {
  const until = addDays(today, days);
  const soonUntil = addDays(today, SOON_DAYS);
  const timing = (date: string) => ({ date, overdue: date < today, soon: date <= soonUntil });
  const out: WorkItem[] = upcoming(cases, charId, today, days).map(({ case: c, deadline }) => ({
    kind: "deadline",
    key: "deadline:" + c.id + ":" + deadline.id,
    case: c,
    deadline,
    ...timing(deadline.date),
  }));
  for (const c of cases) {
    for (const action of c.actions || []) {
      if (action.done || !action.due || action.due > until || (charId && action.owner !== charId)) continue;
      out.push({ kind: "action", key: "action:" + c.id + ":" + action.id, case: c, action, ...timing(action.due) });
    }
  }
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const invoice of receivables(invoices)) {
    const c = byId.get(invoice.caseId);
    if (charId && !(c && isMember(c, charId))) continue;
    out.push({
      kind: "invoice",
      key: "invoice:" + invoice.id,
      invoice,
      ...(c ? { case: c } : {}),
      balance: invoiceBalance(invoice),
      ...timing(invoiceDue(invoice)),
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      ORDER[a.kind] - ORDER[b.kind],
  );
}
