// Partner reports (LP-34): billable hours per character, revenue by month and
// open cases by status, worked out from the Ledger and the Case File. Each
// report is a plain table (columns and rows of text), so the page, its bars
// and the CSV download all read the same figures.

import { isMember } from "./cases";
import { STATUSES } from "./docketFields";
import { MONTH_NAMES } from "./deadlines";
import { invoiceTotal, type Invoice } from "./invoices";
import { entryValue, filterEntries, formatMoney, totalHours, type TimeEntry } from "./ledger";
import type { Case } from "./types";

export interface ReportFilter {
  /** Game dates, both inclusive. */
  from?: string;
  to?: string;
  /** A character's id: their hours, and the cases they're on. */
  character?: string;
}

export interface Report {
  title: string;
  columns: string[];
  rows: string[][];
  /** Each row's size for its bar, in the units of `barColumn`. */
  bars: number[];
}

const inRange = (date: string, f: ReportFilter) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
const sumCents = (ns: number[]) => ns.reduce((t, n) => t + Math.round(n * 100), 0) / 100;

/** Billable hours and their value per character, most hours first. */
export function hoursReport(
  entries: readonly TimeEntry[],
  f: ReportFilter,
  nameOf: (id: string) => string,
  rateOf: (e: TimeEntry) => number | null,
): Report {
  const by = new Map<string, TimeEntry[]>();
  for (const e of filterEntries(entries, f)) by.set(e.character, [...(by.get(e.character) || []), e]);
  const rows = [...by]
    .map(([id, list]) => ({
      name: nameOf(id),
      hours: totalHours(list),
      value: sumCents(list.map((e) => entryValue(e, rateOf(e)) ?? 0)),
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  return {
    title: "Billable hours",
    columns: ["Character", "Hours", "Value"],
    rows: rows.map((r) => [r.name, r.hours.toFixed(1), formatMoney(r.value)]),
    bars: rows.map((r) => r.hours),
  };
}

/** "1990-10" → "October 1990". */
const monthName = (ym: string) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4);

/**
 * Revenue by game month, oldest first: billed (invoice totals by the month issued) and received
 * (invoice payments by the month paid, including payments from a retainer). The whole firm's.
 */
export function revenueReport(invoices: readonly Invoice[], f: ReportFilter): Report {
  const months = new Map<string, { billed: number[]; received: number[] }>();
  const at = (date: string) => {
    const ym = date.slice(0, 7);
    if (!months.has(ym)) months.set(ym, { billed: [], received: [] });
    return months.get(ym)!;
  };
  for (const inv of invoices) {
    if (inRange(inv.date, f)) at(inv.date).billed.push(invoiceTotal(inv));
    for (const p of inv.payments) if (inRange(p.date, f)) at(p.date).received.push(p.amount);
  }
  const rows = [...months]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ym, m]) => ({ month: monthName(ym), billed: sumCents(m.billed), received: sumCents(m.received) }));
  return {
    title: "Revenue by month",
    columns: ["Month", "Billed", "Received"],
    rows: rows.map((r) => [r.month, formatMoney(r.billed), formatMoney(r.received)]),
    bars: rows.map((r) => r.received),
  };
}

/** Cases not closed, counted by status (the character's own, when filtered). */
export function casesReport(cases: readonly Case[], f: ReportFilter): Report {
  const open = cases.filter((c) => c.status !== "Closed" && (!f.character || isMember(c, f.character)));
  const rows = STATUSES.filter((s) => s !== "Closed").map(
    (s) => [s, open.filter((c) => c.status === s).length] as const,
  );
  return {
    title: "Open cases by status",
    columns: ["Status", "Cases"],
    rows: rows.map(([s, n]) => [s, String(n)]),
    bars: rows.map(([, n]) => n),
  };
}

/**
 * A report as CSV: the columns, then each row. A cell that a spreadsheet would run as a formula
 * (a name typed as "=…") gets a leading ', and any cell with a comma, quote or line break is quoted.
 */
export function reportCsv(r: Report): string {
  const cell = (raw: string) => {
    const s = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [r.columns, ...r.rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
