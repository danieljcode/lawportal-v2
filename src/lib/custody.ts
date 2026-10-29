// Chain of custody for an exhibit (LP-14): who handled it, when and how.
// Entries are only ever added (a mistake is corrected with a new entry), kept
// in time order on the exhibit, so they sync and back up with its case. Times
// are in-game (1990), New York time, to the minute: "1990-10-20T14:05". The log copies
// as a list for a filing through the template engine, so every value is
// escaped like any other filing text. Pure: no storage.

import { formatDay } from "./deadlines";
import { gameTime } from "./freestyle";
import { isId, newId, text, uniqueById } from "./storage";
import { compile, render } from "./template";
import type { SafeHtml } from "./safeHtml";

export const CUSTODY_ACTIONS = ["received", "reviewed", "copied", "filed", "returned"] as const;
export type CustodyAction = (typeof CUSTODY_ACTIONS)[number];

export const ACTION_LABELS: Record<CustodyAction, string> = {
  received: "Received",
  reviewed: "Reviewed",
  copied: "Copied",
  filed: "Filed",
  returned: "Returned",
};

export interface CustodyEntry {
  id: string;
  /** In-game New York time, YYYY-MM-DDTHH:MM. */
  at: string;
  action: CustodyAction;
  /** Who handled it: the character's name at the time (kept if the character goes). */
  by: string;
  /** The character's id, when it was one of ours. */
  byId?: string;
  note?: string;
}

export const MAX_CUSTODY = 300;

const AT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** Now in the game (1990), New York time, to the minute. */
export function gameNow(now: Date = new Date()): string {
  const t = gameTime(now);
  return t.date + "T" + t.time;
}

/** A real time of day on a real date: no 25:00 or 30 Feb. */
export function isCustodyTime(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = AT_RE.exec(v);
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59) return false;
  const [y, mo, d] = m[1].split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** "Sat 20 Oct 1990, 14:05". */
export function formatAt(at: string): string {
  return formatDay(at.slice(0, 10)) + ", " + at.slice(11, 16);
}

/** Normalise an untrusted entry; null without a valid time, action or handler. */
export function cleanCustodyEntry(input: unknown): CustodyEntry | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const by = text(o.by, 100);
  if (!isCustodyTime(o.at) || !CUSTODY_ACTIONS.includes(o.action as CustodyAction) || !by) return null;
  const note = text(o.note, 1000);
  return {
    id: isId(o.id) ? o.id : newId(),
    at: o.at,
    action: o.action as CustodyAction,
    by,
    ...(isId(o.byId) ? { byId: o.byId } : {}),
    ...(note ? { note } : {}),
  };
}

/** Oldest first; entries at the same minute keep the order they were added in. */
function byTime(list: CustodyEntry[]): CustodyEntry[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.at < b.e.at ? -1 : a.e.at > b.e.at ? 1 : a.i - b.i))
    .map((x) => x.e);
}

/** An exhibit's log, cleaned, in time order, without repeated ids (the newest MAX_CUSTODY). */
export function cleanCustody(input: unknown): CustodyEntry[] {
  return byTime(uniqueById(input, cleanCustodyEntry)).slice(-MAX_CUSTODY);
}

/** Add an entry: the log stays in time order, and nothing already in it changes. */
export function appendCustody(list: CustodyEntry[], entry: CustodyEntry): CustodyEntry[] {
  return byTime([...list, entry]).slice(-MAX_CUSTODY);
}

/** Two copies of one exhibit's log as one: every entry either copy has. */
export function unionCustody(first: CustodyEntry[], second: CustodyEntry[]): CustodyEntry[] {
  const ids = new Set(first.map((e) => e.id));
  return byTime([...first, ...second.filter((e) => !ids.has(e.id))]).slice(-MAX_CUSTODY);
}

/** One line per entry: "Sat 20 Oct 1990, 14:05: Received by Alice Lawyer. Sealed bag." */
export function custodyLine(e: CustodyEntry): string {
  return formatAt(e.at) + ": " + ACTION_LABELS[e.action] + " by " + e.by + "." + (e.note ? " " + e.note : "");
}

export function custodyTitle(letter: string, title: string): string {
  return "Chain of custody: Exhibit " + letter + " (" + title + ")";
}

/** The log as plain text: a title, then numbered lines. */
export function custodyText(letter: string, title: string, log: CustodyEntry[]): string {
  return [custodyTitle(letter, title), ...log.map((e, i) => i + 1 + ". " + custodyLine(e))].join("\n");
}

const LIST = compile("<p><strong>{{Title}}</strong></p>\n<ol>\n{{Entries:list|<li>No entries.</li>}}\n</ol>");

/** The log as HTML for a filing, through the template engine (every value escaped). */
export function custodyHtml(letter: string, title: string, log: CustodyEntry[]): SafeHtml {
  // One entry per line of the list field, so a note can't start a new item.
  const entries = log.map((e) => custodyLine(e).replace(/\s*\n\s*/g, " ")).join("\n");
  return render(LIST, { Title: custodyTitle(letter, title), Entries: entries });
}
