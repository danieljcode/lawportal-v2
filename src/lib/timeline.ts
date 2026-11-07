// A case's timeline (LP-219): everything on a case in date order, built from what's already stored
// (the case, Filing history, the Ledger's time and invoices). Read-only and pure: no store of its own.

import { ACTION_LABELS } from "./custody";
import { exhibitLetter } from "./exhibits";
import { VIA_LABELS, type Filing } from "./filings";
import { gameTime } from "./gameTime";
import { invoiceTotal, METHOD_LABELS, type Invoice } from "./invoices";
import { ACTIVITY_LABELS, formatMoney, hoursText, type TimeEntry } from "./ledger";
import type { Case } from "./types";

export const TIMELINE_KINDS = ["filing", "note", "deadline", "action", "evidence", "time", "invoice"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/** The type filter's names, in its order. */
export const KIND_LABELS: Record<TimelineKind, string> = {
  filing: "Filings",
  note: "Notes",
  deadline: "Deadlines and hearings",
  action: "Next actions done",
  evidence: "Evidence",
  time: "Time",
  invoice: "Invoices and payments",
};

export interface TimelineEvent {
  key: string;
  kind: TimelineKind;
  /** Game date, YYYY-MM-DD; "" when it isn't known (an action ticked off before LP-219). */
  date: string;
  /** Game time of day, "HH:MM", when known. */
  time?: string;
  title: string;
  detail?: string;
  /** Where it lives: a section of the case view (its id), or a route (starting with "#"). */
  target: string;
}

export interface TimelineSources {
  filings: readonly Filing[];
  time: readonly TimeEntry[];
  invoices: readonly Invoice[];
  /** A character's name from their id ("" when unknown). */
  nameOf(id: string | null | undefined): string;
}

const by = (name: string) => (name ? " by " + name : "");

/** Real time → game date and time. */
function game(at: string): { date: string; time: string } | null {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : gameTime(d);
}

/** Everything on `c`, newest first; undated entries last. `sources.filings` should already be this case's. */
export function caseTimeline(c: Case, sources: TimelineSources): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const ledger = "#ledger/case/" + c.id;

  for (const f of sources.filings) {
    const g = game(f.at);
    if (g) {
      out.push({
        key: "filing:" + f.id,
        kind: "filing",
        ...g,
        title: f.formTitle,
        detail: VIA_LABELS[f.via] + by(f.charName || ""),
        target: "case-filings",
      });
    }
  }
  for (const n of c.caseNotes || []) {
    const g = game(n.at);
    if (g)
      out.push({
        key: "note:" + n.id,
        kind: "note",
        ...g,
        title: "Note" + by(sources.nameOf(n.by)),
        detail: n.text,
        target: "case-notes",
      });
  }
  for (const d of c.deadlines) {
    out.push({
      key: "deadline:" + d.id,
      kind: "deadline",
      date: d.date,
      title: d.label + (d.done ? " (dealt with)" : ""),
      detail: d.note,
      target: "case-deadlines",
    });
  }
  for (const a of c.actions || []) {
    if (!a.done) continue;
    out.push({
      key: "action:" + a.id,
      kind: "action",
      date: a.doneOn || "",
      title: "Done: " + a.title,
      detail: sources.nameOf(a.owner) || undefined,
      target: "case-actions",
    });
  }
  c.exhibits.forEach((x, i) => {
    const name = "Exhibit " + exhibitLetter(i) + ", " + x.title;
    if (x.obtained) {
      out.push({
        key: "exhibit:" + x.id,
        kind: "evidence",
        date: x.obtained,
        title: name + ": obtained",
        target: "case-evidence",
      });
    }
    for (const e of x.custody || []) {
      out.push({
        key: "custody:" + e.id,
        kind: "evidence",
        date: e.at.slice(0, 10),
        time: e.at.slice(11, 16),
        title: name + ": " + ACTION_LABELS[e.action].toLowerCase() + " by " + e.by,
        detail: e.note,
        target: "case-evidence",
      });
    }
  });
  for (const t of sources.time) {
    if (t.caseId !== c.id) continue;
    out.push({
      key: "time:" + t.id,
      kind: "time",
      date: t.date,
      title: hoursText(t.hours) + ", " + ACTIVITY_LABELS[t.activity].toLowerCase() + by(sources.nameOf(t.character)),
      detail: t.note,
      target: ledger,
    });
  }
  for (const inv of sources.invoices) {
    if (inv.caseId !== c.id) continue;
    out.push({
      key: "invoice:" + inv.id,
      kind: "invoice",
      date: inv.date,
      title: "Invoice " + inv.number + " issued, " + formatMoney(invoiceTotal(inv)),
      target: ledger + "/invoices",
    });
    for (const p of inv.payments) {
      out.push({
        key: "payment:" + inv.id + ":" + p.id,
        kind: "invoice",
        date: p.date,
        title: formatMoney(p.amount) + " paid on " + inv.number + ", " + METHOD_LABELS[p.method].toLowerCase(),
        detail: p.note,
        target: ledger + "/invoices",
      });
    }
  }

  // Newest day first; within a day, timed entries latest first, then the rest. Undated last.
  const sortKey = (e: TimelineEvent) => (e.date || "0000") + "T" + (e.time || "");
  return out.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0));
}

/** The timeline as days, newest first: [date ("" for undated), its entries]. */
export function byDay(events: readonly TimelineEvent[]): Array<[string, TimelineEvent[]]> {
  const days: Array<[string, TimelineEvent[]]> = [];
  for (const e of events) {
    const last = days[days.length - 1];
    if (last && last[0] === e.date) last[1].push(e);
    else days.push([e.date, [e]]);
  }
  return days;
}
