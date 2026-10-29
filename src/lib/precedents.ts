// The firm's precedents (LP-16): rulings the firm has been involved in, for the
// Law Library. Each has a case name and number, court, in-game date, judge,
// summary, key holding, a link to the forum thread and topic tags. One list
// under lawapp_precedents on the store base; it syncs (merged per ruling by
// `updated`, like cases) and is in the full backup. Search, highlighting and
// the citation format are pure functions here.

import { APPELLATE_COURT, DIVISION_COURTS, SUPREME_COURT } from "./courts";
import { safeLink } from "./exhibits";
import { defaultKV, isId, ISO_DATE_RE, ISO_TIME_RE, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";

export const PRECEDENTS_KEY = "lawapp_precedents";
export const PRECEDENTS_VERSION = 1;
export const MAX_PRECEDENTS = 1000;
export const MAX_TAGS = 20;

export interface Precedent {
  id: string;
  /** "Smith v. Jones", "People v. Lee". */
  caseName: string;
  caseNumber?: string;
  court?: string;
  /** In-game date of the ruling, YYYY-MM-DD. */
  date?: string;
  judge?: string;
  summary?: string;
  holding?: string;
  /** The forum thread: http(s) only, stored, never fetched. */
  link?: string;
  /** Topics, lower case: "search and seizure", "contracts". */
  tags: string[];
  /** Real time, ISO: the newer copy wins a sync merge. */
  created: string;
  updated: string;
}

/** Courts offered as suggestions (any court can be typed). */
export const COURT_SUGGESTIONS: readonly string[] = [...Object.values(DIVISION_COURTS), APPELLATE_COURT, SUPREME_COURT];

/** "Search and Seizure, contracts ,, Contracts" → ["search and seizure", "contracts"]. */
export function cleanTags(input: unknown): string[] {
  const raw = typeof input === "string" ? input.split(",") : Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}

/** Normalise an untrusted ruling (form, sync, backup); null without a case name. */
export function cleanPrecedent(input: unknown, now: string = new Date().toISOString()): Precedent | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const caseName = text(o.caseName, 200);
  if (!caseName) return null;
  const fields = {
    caseNumber: text(o.caseNumber, 60),
    court: text(o.court, 120),
    date: typeof o.date === "string" && ISO_DATE_RE.test(o.date) ? o.date : undefined,
    judge: text(o.judge, 120),
    summary: text(o.summary, 4000),
    holding: text(o.holding, 2000),
    link: safeLink(o.link),
  };
  const created = typeof o.created === "string" && ISO_TIME_RE.test(o.created) ? o.created : now;
  return {
    id: isId(o.id) ? o.id : newId(),
    caseName,
    ...(Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Partial<Precedent>),
    tags: cleanTags(o.tags),
    created,
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : created,
  };
}

/** Newest ruling first; undated ones after, by case name. */
function order(list: Precedent[]): Precedent[] {
  return [...list].sort(
    (a, b) =>
      (b.date || "").localeCompare(a.date || "") || a.caseName.localeCompare(b.caseName) || a.id.localeCompare(b.id),
  );
}

function validList(raw: unknown): Precedent[] {
  return order(uniqueById(raw, cleanPrecedent)).slice(0, MAX_PRECEDENTS);
}

/* ---------- search ---------- */

/** The words searched for, lower case. */
export function searchTerms(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t),
    ),
  ];
}

const haystack = (p: Precedent) =>
  [p.caseName, p.caseNumber, p.court, p.judge, p.summary, p.holding, ...p.tags]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

/** Rulings with every search word somewhere (name, number, court, judge, summary, holding, tags), and the tag if given. */
export function filterPrecedents(list: readonly Precedent[], f: { q?: string; tag?: string }): Precedent[] {
  const terms = searchTerms(f.q || "");
  return list.filter((p) => {
    if (f.tag && !p.tags.includes(f.tag)) return false;
    if (!terms.length) return true;
    const h = haystack(p);
    return terms.every((t) => h.includes(t));
  });
}

/** Every tag in use, A–Z. */
export function allTags(list: readonly Precedent[]): string[] {
  return [...new Set(list.flatMap((p) => p.tags))].sort();
}

/** `text` split into pieces, with the search words marked (case-insensitive), for highlighting. */
export function highlightParts(text: string, terms: readonly string[]): Array<{ text: string; hit: boolean }> {
  const words = terms.filter((t) => t).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || !text) return [{ text, hit: false }];
  // Longest first, so "jones" isn't cut short by "jon".
  const re = new RegExp("(" + words.sort((a, b) => b.length - a.length).join("|") + ")", "i");
  // Splitting on a captured pattern alternates: text, match, text, match…
  return text
    .split(re)
    .map((s, i) => ({ text: s, hit: i % 2 === 1 }))
    .filter((p) => p.text);
}

/* ---------- citation ---------- */

/** "Smith v. Jones, 90SCCV00123 (San Andreas Civil Court 1990)". */
export function citation(p: Precedent): string {
  const where = [p.court, p.date ? p.date.slice(0, 4) : ""].filter(Boolean).join(" ");
  return p.caseName + (p.caseNumber ? ", " + p.caseNumber : "") + (where ? " (" + where + ")" : "");
}

/* ---------- the store ---------- */

export interface PrecedentStore {
  /** Newest ruling first. */
  list(): Precedent[];
  get(id: string): Precedent | null;
  /** Add or update a ruling; returns it as saved. Throws when it has no case name. */
  save(input: Partial<Precedent> & { caseName: string }): Precedent;
  remove(id: string): void;
  /** Replace every ruling (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createPrecedentStore(kv: KV): PrecedentStore {
  const store = createStore<Precedent[]>(kv, {
    key: PRECEDENTS_KEY,
    version: PRECEDENTS_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  return {
    list: () => store.get(),
    get: (id) => store.get().find((p) => p.id === id) || null,
    save(input) {
      const list = store.get();
      const before = input.id ? list.find((p) => p.id === input.id) : undefined;
      const now = new Date().toISOString();
      const p = cleanPrecedent({ ...input, created: before?.created || now, updated: now }, now);
      if (!p) throw new Error("Give the ruling a case name, e.g. Smith v. Jones.");
      if (!before && list.length >= MAX_PRECEDENTS) {
        throw new Error("The library can hold up to " + MAX_PRECEDENTS + " rulings.");
      }
      store.set(order([...list.filter((x) => x.id !== p.id), p]));
      return p;
    },
    remove(id) {
      store.set(store.get().filter((p) => p.id !== id));
    },
    replaceAll(items) {
      store.set(validList(items));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: PrecedentStore | null = null;

/** The app's precedents (created on first use; client only). */
export function precedentStore(): PrecedentStore {
  if (!instance) instance = createPrecedentStore(defaultKV());
  return instance;
}
