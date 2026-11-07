// A case brief for Discord (LP-228): where a case stands, in one message, to paste in the firm
// channel. Typed text is escaped like other Discord output; dates are in game time. Billing only
// when asked for. Pure: the caller passes names and billing.

import { openActions } from "./actions";
import { caseParties } from "./cases";
import { formatDay } from "./deadlines";
import { escapeMarkdown } from "./discord/escape";
import { formatMoney, hoursText } from "./ledger";
import type { Case } from "./types";

/** One Discord message. */
export const BRIEF_LIMIT = 2000;
/** The most of any one typed field the brief shows. */
const FIELD = 150;

export interface BriefBilling {
  loggedHours: number;
  invoiced: number;
  paid: number;
  outstanding: number;
}

export interface BriefOptions {
  nameOf(id: string | null | undefined): string;
  /** Game date, YYYY-MM-DD. */
  today: string;
  /** Shown only when given ("Include billing"). */
  billing?: BriefBilling | null;
}

/** Typed text, made safe for Discord and cut to `max` characters. */
function safe(s: string, max = FIELD): string {
  const one = s.replace(/\s+/g, " ").trim();
  return escapeMarkdown(one.length > max ? one.slice(0, max - 1) + "…" : one);
}

/** The next court date: the soonest open deadline (overdue first), else the docket's Next event. */
function nextDate(c: Case, today: string): string {
  const open = c.deadlines.filter((d) => !d.done).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const d = open[0];
  if (d) return formatDay(d.date) + ", " + safe(d.label) + (d.date < today ? " (overdue)" : "");
  if (c.nextDate && /^\d{4}-\d{2}-\d{2}$/.test(c.nextDate)) {
    return formatDay(c.nextDate) + (c.nextEvent ? ", " + safe(c.nextEvent) : "");
  }
  return c.nextEvent ? safe(c.nextEvent) : "none";
}

/** The brief, at most BRIEF_LIMIT characters: the action list is cut to "…and n more" to fit. */
export function caseBrief(c: Case, o: BriefOptions): string {
  const parties = caseParties(c);
  const lead = c.lead ? o.nameOf(c.lead) || "unknown" : "none";
  const also = c.assigned.map((id) => o.nameOf(id)).filter(Boolean);
  const head = [
    "**" + safe(c.caseNumber, 40) + "**" + (parties ? " · " + safe(parties) : ""),
    "Status: " +
      c.status +
      " · Lead: " +
      escapeMarkdown(lead) +
      (also.length ? " (with " + escapeMarkdown(also.join(", ")) + ")" : ""),
    ...(c.court ? ["Court: " + safe(c.court)] : []),
    "Next date: " + nextDate(c, o.today),
  ];
  const b = o.billing;
  const tail = b
    ? [
        "Billing: " +
          hoursText(b.loggedHours) +
          " logged · " +
          formatMoney(b.invoiced) +
          " invoiced, " +
          formatMoney(b.paid) +
          " paid, " +
          formatMoney(b.outstanding) +
          " owed",
      ]
    : [];

  const actions = openActions(c.actions || []).map((a) => {
    const who = a.owner ? o.nameOf(a.owner) : "";
    const extra = [who ? escapeMarkdown(who) : "", a.due ? "due " + formatDay(a.due) : ""].filter(Boolean).join(", ");
    return "- " + safe(a.title, 120) + (extra ? " (" + extra + ")" : "");
  });
  const build = (shown: number) => {
    const rest = actions.length - shown;
    const list = actions.length
      ? ["Next actions:", ...actions.slice(0, shown), ...(rest ? ["- …and " + rest + " more"] : [])]
      : ["Next actions: none"];
    return [...head, ...list, ...tail].join("\n");
  };
  let shown = actions.length;
  let text = build(shown);
  while (text.length > BRIEF_LIMIT && shown > 0) text = build(--shown);
  return text.length > BRIEF_LIMIT ? text.slice(0, BRIEF_LIMIT - 1) + "…" : text;
}
