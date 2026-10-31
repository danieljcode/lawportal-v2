// The Ledger's time entries (LP-32): billable time logged against a Case File
// case by one of the user's characters, on a game date. One list under
// lawapp_time on the store base; it syncs (merged per entry by `updated`, like
// filings: no Restore my version) and is in the full backup.

import { ISO_DATE_RE, ISO_TIME_RE, defaultKV, isId, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";

export const TIME_KEY = "lawapp_time";
export const TIME_VERSION = 1;
export const MAX_TIME_ENTRIES = 5000;
/** Most hours one entry can hold. */
export const MAX_HOURS = 24;

export const ACTIVITIES = ["research", "drafting", "court", "meeting"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<Activity, string> = {
  research: "Research",
  drafting: "Drafting",
  court: "Court",
  meeting: "Meeting",
};

export interface TimeEntry {
  id: string;
  /** The Case File case's id. */
  caseId: string;
  /** The character who did the work (their id). */
  character: string;
  /** Game date, YYYY-MM-DD. */
  date: string;
  /** In tenths: 0.1 to MAX_HOURS. */
  hours: number;
  activity: Activity;
  note?: string;
  /** Real time, ISO: the newer copy wins a sync merge. */
  created: string;
  updated: string;
}

const isActivity = (v: unknown): v is Activity => (ACTIVITIES as readonly unknown[]).includes(v);

/** Hours as typed ("1.25", 2) → rounded to a tenth, or null outside 0.1 to MAX_HOURS. */
export function parseHours(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const tenths = Math.round(n * 10) / 10;
  return tenths >= 0.1 && tenths <= MAX_HOURS ? tenths : null;
}

/** Most an hourly rate can be, in dollars. */
export const MAX_RATE = 100_000;

/** A rate as typed ("150", "$1,200.5") → dollars to the cent, or null when it isn't one from 0.01 to MAX_RATE. */
export function parseRate(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[$,s]/g, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100) / 100;
  return cents >= 0.01 && cents <= MAX_RATE ? cents : null;
}

/** An entry's worth at an hourly rate, to the cent; null without a rate. */
export function entryValue(e: Pick<TimeEntry, "hours">, rate: number | null): number | null {
  return rate === null ? null : Math.round(e.hours * rate * 100) / 100;
}

/** "$1,234.50". */
export function formatMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Normalise an untrusted entry (form, sync, backup); null without a case, character, date or hours. */
export function cleanEntry(input: unknown, now: string = new Date().toISOString()): TimeEntry | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const hours = parseHours(o.hours);
  if (!isId(o.caseId) || !isId(o.character) || typeof o.date !== "string" || !ISO_DATE_RE.test(o.date) || !hours) {
    return null;
  }
  const note = text(o.note, 500);
  const created = typeof o.created === "string" && ISO_TIME_RE.test(o.created) ? o.created : now;
  return {
    id: isId(o.id) ? o.id : newId(),
    caseId: o.caseId,
    character: o.character,
    date: o.date,
    hours,
    activity: isActivity(o.activity) ? o.activity : "research",
    ...(note ? { note } : {}),
    created,
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : created,
  };
}

/** Newest date first, then newest logged. */
function order(list: TimeEntry[]): TimeEntry[] {
  return [...list].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.created !== b.created ? (a.created < b.created ? 1 : -1) : 0,
  );
}

function validList(raw: unknown): TimeEntry[] {
  return order(uniqueById(raw, cleanEntry)).slice(0, MAX_TIME_ENTRIES);
}

export interface TimeFilter {
  caseId?: string;
  character?: string;
  /** Game dates, YYYY-MM-DD, both inclusive. */
  from?: string;
  to?: string;
}

/** The entries on the case, by the character, between the dates; each filter only when given. */
export function filterEntries(list: readonly TimeEntry[], f: TimeFilter): TimeEntry[] {
  return list.filter(
    (e) =>
      (!f.caseId || e.caseId === f.caseId) &&
      (!f.character || e.character === f.character) &&
      (!f.from || e.date >= f.from) &&
      (!f.to || e.date <= f.to),
  );
}

/** Total hours, to a tenth (summed in tenths, so 0.1 + 0.2 is 0.3). */
export function totalHours(list: readonly TimeEntry[]): number {
  return list.reduce((n, e) => n + Math.round(e.hours * 10), 0) / 10;
}

export interface TimeStore {
  /** Newest date first. */
  list(): TimeEntry[];
  get(id: string): TimeEntry | null;
  /** Add or update an entry; returns it as saved. Throws when it isn't complete. */
  save(input: Partial<TimeEntry>): TimeEntry;
  remove(id: string): void;
  /** Replace every entry (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createTimeStore(kv: KV): TimeStore {
  const store = createStore<TimeEntry[]>(kv, {
    key: TIME_KEY,
    version: TIME_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  return {
    list: () => store.get(),
    get: (id) => store.get().find((e) => e.id === id) || null,
    save(input) {
      const list = store.get();
      const before = input.id ? list.find((e) => e.id === input.id) : undefined;
      const now = new Date().toISOString();
      if (!parseHours(input.hours)) throw new Error("Give the hours, from 0.1 to " + MAX_HOURS + ".");
      const e = cleanEntry({ ...input, created: before?.created || now, updated: now }, now);
      if (!e) throw new Error("Pick a case, a character and a date.");
      if (!before && list.length >= MAX_TIME_ENTRIES) {
        throw new Error("The Ledger can hold up to " + MAX_TIME_ENTRIES + " time entries.");
      }
      store.set(order([...list.filter((x) => x.id !== e.id), e]));
      return e;
    },
    remove(id) {
      store.set(store.get().filter((e) => e.id !== id));
    },
    replaceAll(items) {
      store.set(validList(items));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: TimeStore | null = null;

/** The app's time entries (created on first use; client only). */
export function timeStore(): TimeStore {
  if (!instance) instance = createTimeStore(defaultKV());
  return instance;
}
