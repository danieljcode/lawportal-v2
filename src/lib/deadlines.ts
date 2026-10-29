// Deadlines and hearing dates on cases (LP-18). Each case holds dated entries
// ("Response due", "Hearing") with a note. Dates are in-game (the 1990
// calendar, as forms fill them): "today" is gameTime().date (LP-135).
//
// Upcoming lists what's due in the next 14 days across the active character's
// cases, with overdue entries first; the toolbar shows a dot when something is
// due within 48 hours (or overdue). Pure: no storage.

import type { Entry, Values } from "./types";
import { gameTime, YEAR_OFFSET } from "./gameTime";
import { isId, ISO_DATE_RE, newId, text, uniqueById } from "./storage";
import type { Case, Deadline } from "./types";

export const MAX_DEADLINES = 100;
export const UPCOMING_DAYS = 14;
export const SOON_DAYS = 2;

/** Normalise an untrusted deadline; null when it has no valid date or label. */
export function cleanDeadline(input: unknown): Deadline | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const label = text(o.label, 120);
  if (typeof o.date !== "string" || !ISO_DATE_RE.test(o.date) || !label) return null;
  return {
    id: isId(o.id) ? o.id : newId(),
    date: o.date,
    label,
    ...(text(o.note, 1000) ? { note: text(o.note, 1000) } : {}),
    ...(o.done === true ? { done: true } : {}),
  };
}

/** A case's deadlines, cleaned, without repeated ids, soonest first. */
export function cleanDeadlines(input: unknown): Deadline[] {
  return sortDeadlines(uniqueById(input, cleanDeadline)).slice(0, MAX_DEADLINES);
}

export function sortDeadlines(list: Deadline[]): Deadline[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label.localeCompare(b.label)));
}

/** Two copies of one case's deadlines as one list: by id, the first list's copy wins. */
export function unionDeadlines(first: Deadline[], second: Deadline[]): Deadline[] {
  const ids = new Set(first.map((d) => d.id));
  return sortDeadlines([...first, ...second.filter((d) => !ids.has(d.id))]).slice(0, MAX_DEADLINES);
}

/* ---------- the 1990 calendar ---------- */

export const pad = (n: number) => String(n).padStart(2, "0");

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Today in the game (1990), as YYYY-MM-DD, New York time. */
export function gameToday(now: Date = new Date()): string {
  return gameTime(now).date;
}

/** YYYY-MM-DD plus `n` days; "" when `iso` isn't a date. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  if (Number.isNaN(t.getTime())) return "";
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sun 25 Oct 1990" for 1990-10-25: the weekday of the real date it maps to (2026-10-25). */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y - YEAR_OFFSET, m - 1, d));
  return `${DAYS[t.getUTCDay()]} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/** The weekdays Monday first, as the date picker's columns (LP-159). */
export const WEEKDAYS = [...DAYS.slice(1), DAYS[0]];

/**
 * A game month as Monday-first weeks of day numbers, with null padding the first and last week.
 * The weekdays are the real year's (game year + 36), as formatDay's are.
 */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const real = year - YEAR_OFFSET;
  const lead = (new Date(Date.UTC(real, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(real, month, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** The same day `n` months on, kept inside that month: 31 Jan plus one month is the end of February. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y - YEAR_OFFSET, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear() + YEAR_OFFSET}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/**
 * A typed game date as YYYY-MM-DD, or "" when it isn't one. Takes "1990-10-29", "29/10/1990",
 * "29 Oct 1990" and "Thu 29 October 1990" (the weekday is ignored).
 */
export function parseGameDate(text: string): string {
  const s = text.trim();
  let y = 0;
  let m = 0;
  let d = 0;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(?:[a-z]+,?\s+)?(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{4})$/i.exec(s))) {
    const word = r[2].toLowerCase();
    [d, m, y] = [+r[1], MONTH_NAMES.findIndex((name) => name.toLowerCase().startsWith(word)) + 1, +r[3]];
  }
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return y >= 1000 && m && d && addDays(iso, 0) === iso ? iso : "";
}

/** "today", "tomorrow", "in 3 days", "yesterday", "2 days ago". */
export function relativeDay(iso: string, today: string): string {
  const diff = Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? "in " + diff + " days" : -diff + " days ago";
}

/* ---------- upcoming ---------- */

export interface UpcomingItem {
  case: Case;
  deadline: Deadline;
  overdue: boolean;
  /** Due within SOON_DAYS (or overdue). */
  soon: boolean;
}

/**
 * Deadlines not done and due within `days` of today (overdue ones too), on the
 * character's cases (every case when no character is given). Overdue first,
 * then soonest.
 */
export function upcoming(
  cases: readonly Case[],
  charId: string | null,
  today: string,
  days: number = UPCOMING_DAYS,
): UpcomingItem[] {
  const until = addDays(today, days);
  const soonUntil = addDays(today, SOON_DAYS);
  const out: UpcomingItem[] = [];
  for (const c of cases) {
    if (charId && c.lead !== charId && !c.assigned.includes(charId)) continue;
    for (const d of c.deadlines) {
      if (d.done || d.date > until) continue;
      out.push({ case: c, deadline: d, overdue: d.date < today, soon: d.date <= soonUntil });
    }
  }
  return out.sort((a, b) => (a.deadline.date < b.deadline.date ? -1 : a.deadline.date > b.deadline.date ? 1 : 0));
}

/** How many of the character's deadlines are due within 48 hours or overdue (the toolbar dot). */
export function dueSoonCount(cases: readonly Case[], charId: string | null, today: string): number {
  return upcoming(cases, charId, today, SOON_DAYS).length;
}

/* ---------- from a form ---------- */

export interface FormDate {
  label: string;
  date: string;
  /** Suggested: a computed date (a schedule, today+21) or one named like a hearing or deadline. */
  suggested: boolean;
}

const NAMED = /trial|hearing|judge?ment|deadline|due|expir|ceremony|closing|opening|motion|examination/i;

/** The filled-in date fields of a form (top level, and optional sections that are on). */
export function formDates(entries: Entry[], values: Values): FormDate[] {
  const out: FormDate[] = [];
  const seen = new Set<string>();
  const walk = (list: Entry[]) => {
    for (const e of list) {
      if ("field" in e) {
        const f = e.field;
        const v = values[f.label];
        if (f.type !== "date" || typeof v !== "string" || !ISO_DATE_RE.test(v) || seen.has(f.label)) continue;
        seen.add(f.label);
        const computed = !!f.prefill && f.prefill.trim().toLowerCase() !== "today";
        out.push({ label: f.label, date: v, suggested: computed || NAMED.test(f.label) });
      } else if ("cond" in e) {
        const on = values["?" + e.cond.name];
        if (on === undefined ? e.cond.on : on) walk(e.fields);
      }
    }
  };
  walk(entries);
  return out;
}

/** Add dates to a case's deadlines, skipping any already there with the same date and label. */
export function addDeadlines(existing: Deadline[], dates: Array<{ date: string; label: string }>): Deadline[] {
  const have = new Set(existing.map((d) => d.date + "|" + d.label.toLowerCase()));
  const added = dates
    .filter((x) => !have.has(x.date + "|" + x.label.toLowerCase()))
    .map((x) => cleanDeadline({ date: x.date, label: x.label }))
    .filter((d): d is Deadline => !!d);
  return sortDeadlines([...existing, ...added]).slice(0, MAX_DEADLINES);
}
