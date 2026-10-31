// Case File data (LP-4): cases belong to the firm, with a lead character and
// others assigned, so several characters can work one case and nothing is lost
// when a character leaves. One list under lawapp_cases, on the store base.
//
// Version 1 is the first: with nothing saved, its migration step turns the old
// per-character dockets (lawapp_dockets_<id>, LP-99) into cases, one per case
// number, and removes those keys once the cases are saved. The Dockets dialog
// and the docket bar read and write cases through dockets.ts until the Case
// File program takes over (LP-101, LP-100).

import { cleanDeadlines, unionDeadlines } from "./deadlines";
import { cleanExhibits, unionExhibits } from "./exhibits";
import { clean as cleanDocket, DOCKETS_PREFIX } from "./docketFields";
import { parseRate } from "./ledger";
import { defaultKV, isId, isObject, ISO_TIME_RE, newId, setAside, uniqueById, type KV } from "./storage";
import { createStore, unwrap, type Migration } from "./store";
import type { Case, Docket } from "./types";

export const CASES_KEY = "lawapp_cases";
export const CASES_VERSION = 1;
export const MAX_CASES = 2000;

export const TOO_MANY_CASES = "The firm can keep up to 2,000 cases.";

const upper = (n: string) => n.trim().toUpperCase();

/** Everyone working a case: the lead first, then the others. */
export function members(c: Pick<Case, "lead" | "assigned">): string[] {
  return c.lead ? [c.lead, ...c.assigned] : [...c.assigned];
}

export function isMember(c: Pick<Case, "lead" | "assigned">, charId: string): boolean {
  return c.lead === charId || c.assigned.includes(charId);
}

/** A case whose lead was deleted, waiting for someone to take it on. */
export function needsLead(c: Pick<Case, "lead">): boolean {
  return c.lead === null;
}

/**
 * The id for a case made from old dockets: the same on every device, from its
 * case number (90SCCR00147 → c90sccr00147), so two devices that each migrated
 * their own dockets end up with the same case.
 */
export function caseIdFor(caseNumber: string): string {
  const id = ("c" + caseNumber.toLowerCase().replace(/[^a-z0-9]/g, "")).slice(0, 32);
  return isId(id) ? id : newId();
}

/** Normalise an untrusted case: the docket fields as dockets.ts cleans them, plus who works it. */
export function cleanCase(input: unknown): Case {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = cleanDocket(o);
  const lead = isId(o.lead) ? o.lead : null;
  const assigned = Array.isArray(o.assigned)
    ? [...new Set(o.assigned.filter((x): x is string => isId(x) && x !== lead))]
    : [];
  const created = typeof o.created === "string" && ISO_TIME_RE.test(o.created) ? o.created : d.updated;
  const rate = parseRate(o.rate);
  return {
    ...d,
    lead,
    assigned,
    created,
    deadlines: cleanDeadlines(o.deadlines),
    exhibits: cleanExhibits(o.exhibits),
    ...(rate !== null ? { rate } : {}),
  };
}

function validList(raw: unknown): Case[] {
  return uniqueById(raw, (item) => {
    if (!isObject(item)) return null;
    const c = cleanCase(item);
    return c.caseNumber ? c : null;
  });
}

/** Fields from `newer`, gaps filled from `older`; differing notes kept together. */
function combine(newer: Case, older: Case): Case {
  const out: Case = { ...newer };
  for (const [k, v] of Object.entries(older)) {
    const key = k as keyof Case;
    if (out[key] === undefined && v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  const notes = [newer.notes, older.notes].filter((n): n is string => !!n);
  if (notes.length === 2 && notes[0] !== notes[1] && !notes[0].includes(notes[1])) {
    out.notes = (notes[0] + "\n\n" + notes[1]).slice(0, 4000);
  }
  const all = [...members(newer), ...members(older)];
  out.lead = newer.lead ?? older.lead ?? null;
  out.assigned = [...new Set(all.filter((id) => id !== out.lead))];
  out.created = newer.created < older.created ? newer.created : older.created;
  out.deadlines = unionDeadlines(newer.deadlines, older.deadlines);
  out.exhibits = unionExhibits(newer.exhibits, older.exhibits);
  return out;
}

/**
 * Fold lists of cases into one, newest first: the same id, or the same case
 * number, is one case. The newer `updated` wins each field, with gaps filled
 * from the older copy, and everyone working either copy stays on it. The first
 * list's id is kept for a case number both lists have.
 */
export function unifyCases(...lists: Case[][]): Case[] {
  const byId = new Map<string, Case>();
  const byNumber = new Map<string, string>();
  for (const list of lists) {
    for (const c of list) {
      const id = byId.has(c.id) ? c.id : byNumber.get(upper(c.caseNumber));
      const existing = id ? byId.get(id) : undefined;
      if (!existing) {
        byId.set(c.id, c);
        byNumber.set(upper(c.caseNumber), c.id);
        continue;
      }
      const merged = c.updated > existing.updated ? combine(c, existing) : combine(existing, c);
      merged.id = existing.id;
      byId.set(existing.id, merged);
    }
  }
  return [...byId.values()];
}

/**
 * Per-character docket lists → cases, one per case number (the LP-4 migration,
 * and sync documents from before LP-4). The character whose entry was updated
 * most recently leads; the others are assigned.
 */
export function casesFromDockets(byCharacter: Iterable<[string, unknown]>): Case[] {
  const entries: Case[] = [];
  for (const [charId, items] of byCharacter) {
    if (!isId(charId) || !Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object" || !(item as Docket).caseNumber) continue;
      const d = cleanDocket(item);
      if (!d.caseNumber) continue;
      entries.push({
        ...d,
        id: caseIdFor(d.caseNumber),
        lead: charId,
        assigned: [],
        created: d.updated,
        deadlines: [],
        exhibits: [],
      });
    }
  }
  // Newest first, so the newest entry's character leads and its fields win.
  entries.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  return unifyCases(entries);
}

/** The old docket keys and their lists, read without writing. */
function oldDockets(kv: KV): Array<[string, unknown]> | undefined {
  if (!kv.keys) return undefined;
  const out: Array<[string, unknown]> = [];
  for (const key of kv.keys()) {
    const charId = key.slice(DOCKETS_PREFIX.length);
    if (!key.startsWith(DOCKETS_PREFIX) || !isId(charId)) continue;
    try {
      out.push([charId, unwrap(JSON.parse(kv.get(key) ?? "null"))]);
    } catch {
      // unreadable: set aside by the step's clean-up
    }
  }
  return out.length ? out.sort((a, b) => (a[0] < b[0] ? -1 : 1)) : undefined;
}

/** The case list's upgrade steps (LP-4). */
export const CASE_MIGRATIONS: readonly Migration[] = [
  {
    // Nothing saved yet: make cases from the old per-character dockets, then remove them.
    to: 1,
    up: (data, kv) => {
      if (data !== undefined) return data;
      const old = oldDockets(kv);
      return old ? casesFromDockets(old) : undefined;
    },
    after(kv) {
      for (const key of kv.keys?.() ?? []) {
        if (!key.startsWith(DOCKETS_PREFIX) || !isId(key.slice(DOCKETS_PREFIX.length))) continue;
        const raw = kv.get(key);
        try {
          JSON.parse(raw ?? "null");
          kv.remove(key);
        } catch {
          console.warn("[cases] setting aside an unreadable docket " + key);
          if (raw !== null && setAside(kv, key, raw)) kv.remove(key);
        }
      }
    },
  },
];

export interface CaseStore {
  list(): Case[];
  get(id: string): Case | null;
  /** The firm's case with this number (any capitalisation), or null. */
  byNumber(caseNumber: string): Case | null;
  /** Insert or replace by id (cleaned, \`updated\` stamped now). Throws TOO_MANY_CASES when full. */
  save(c: Partial<Case> | Record<string, unknown>): Case;
  remove(id: string): void;
  /** Replace every case (sync and restore). */
  replaceAll(items: unknown): void;
  /**
   * A character was deleted (LP-4): take it off every case instead of deleting
   * them. A case it led keeps its other characters and is left with no lead.
   */
  unassign(charId: string): void;
  /** Bring in the old per-character dockets once (see CASE_MIGRATIONS). */
  migrate(): boolean;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createCaseStore(kv: KV): CaseStore {
  const store = createStore<Case[]>(kv, {
    key: CASES_KEY,
    version: CASES_VERSION,
    validate: validList,
    migrations: CASE_MIGRATIONS,
    isEmpty: (list) => list.length === 0,
  });

  return {
    list: store.get,
    get: (id) => store.get().find((c) => c.id === id) || null,
    byNumber(caseNumber) {
      const wanted = upper(String(caseNumber || ""));
      return wanted ? store.get().find((c) => upper(c.caseNumber) === wanted) || null : null;
    },
    save(input) {
      const list = store.get();
      const c = cleanCase(input);
      c.updated = new Date().toISOString();
      const i = list.findIndex((x) => x.id === c.id);
      if (i >= 0) list[i] = { ...c, created: list[i].created };
      else {
        if (list.length >= MAX_CASES) throw new Error(TOO_MANY_CASES);
        c.created = c.updated;
        list.push(c);
      }
      store.set(list);
      return i >= 0 ? list[i] : c;
    },
    remove(id) {
      store.set(store.get().filter((c) => c.id !== id));
    },
    replaceAll(items) {
      store.set(validList(items).slice(0, MAX_CASES));
    },
    unassign(charId) {
      const now = new Date().toISOString();
      let changed = false;
      const list = store.get().map((c) => {
        if (!isMember(c, charId)) return c;
        changed = true;
        return {
          ...c,
          lead: c.lead === charId ? null : c.lead,
          assigned: c.assigned.filter((x) => x !== charId),
          updated: now,
        };
      });
      if (changed) store.set(list);
    },
    migrate: store.migrate,
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: CaseStore | null = null;

/** The app's case store (created on first use; client only). */
export function caseStore(): CaseStore {
  if (!instance) instance = createCaseStore(defaultKV());
  return instance;
}

/* ---------- the Case File program (LP-101) ---------- */

export interface CaseFilter {
  /** Matches the case number or either party, ignoring case. */
  q?: string;
  /** A status, "needs-lead" for cases without a lead, or "" for all. */
  status?: string;
  /** A character id: their cases only. */
  charId?: string;
}

export const NEEDS_LEAD = "needs-lead";

/** The cases matching a search and filters, open ones first, then by case number. */
export function filterCases(list: readonly Case[], f: CaseFilter): Case[] {
  const q = (f.q || "").trim().toLowerCase();
  return list
    .filter((c) => {
      if (q && ![c.caseNumber, c.plaintiff, c.defendant].some((s) => (s || "").toLowerCase().includes(q))) {
        return false;
      }
      if (f.status === NEEDS_LEAD) {
        if (!needsLead(c)) return false;
      } else if (f.status && c.status !== f.status) return false;
      return !f.charId || isMember(c, f.charId);
    })
    .sort((a, b) => {
      const ca = a.status === "Closed";
      const cb = b.status === "Closed";
      if (ca !== cb) return ca ? 1 : -1;
      return a.caseNumber.localeCompare(b.caseNumber);
    });
}

/** Why a case can't be saved as it is, or null: it needs a number no other firm case has. */
export function caseProblem(c: Pick<Case, "id" | "caseNumber">, list: readonly Case[]): string | null {
  const n = upper(c.caseNumber || "");
  if (!n) return "A case needs a case number.";
  const other = list.find((x) => x.id !== c.id && upper(x.caseNumber) === n);
  return other ? other.caseNumber + " is already a firm case." : null;
}
