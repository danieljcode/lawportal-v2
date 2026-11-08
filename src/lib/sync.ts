// Sync client: keeps characters, dockets and J.A.P. portfolios in step with
// this app's own server (design §Sync client; behaviour per INV §e.4).
//
// Turned on per browser with a sync code. The server copy is the master and
// this browser's storage is a cache of it. Every data change is pushed 700 ms
// after it happens; the latest copy is pulled on init and when the tab comes
// back into view (at most every 20 s unless forced). If another device saved
// in between (a 409 on push, or a newer rev on pull while this browser has
// unsent edits), the two copies are merged one character at a time: the newer
// updatedAt wins, and the J.A.P. goes with its character. Since LP-4 the firm's
// cases sync alongside, merged one case at a time by their own `updated`; a
// copy from before LP-4 (dockets inside each character) is read as cases. The
// filing history (LP-15), the conflict check log (LP-10) and the Ledger's time
// entries (LP-32), invoices (LP-33) and retainer deposits (LP-93) sync the same
// way, one entry at a time. This
// browser's versions that lose are kept under lawapp_sync_lost so the user can
// restore them.
//
// The code lives in local storage under lawapp_sync_code and is only ever sent
// to /api/ in the Authorization header. Client only: nothing runs at import.
import { caseStore, casesFromDockets, cleanCase, foldCases } from "./cases";
import { characterStore } from "./characters";
import { cleanContact, contactStore, type Contact } from "./contacts";
import { cleanCheck, conflictLog, type ConflictCheck } from "./conflicts";
import { cleanFiling, filingStore, type Filing } from "./filings";
import { cleanEntry, timeStore, type TimeEntry } from "./ledger";
import { cleanInvoice, invoiceStore, renumberClashes, type Invoice } from "./invoices";
import { CODE_RE, LOOKALIKE_HINT, normaliseCode } from "./syncCode";
import { cleanDeposit, retainerStore, type Deposit } from "./retainers";
import { checklistStore, cleanChecklist, type Checklist } from "./checklistStore";
import { cleanTemplate, templateStore, type CustomTemplate } from "./customTemplates";
import { cleanPrecedent, precedentStore, type Precedent } from "./precedents";
import { docketStore } from "./dockets";
import { portfolioStore } from "./portfolio";
import { deleteCharacter } from "./services/characters";
import { defaultKV, fromOtherTab, replaceById } from "./storage";
import type { Case } from "./types";
import { S_SYNC_APPLY_FAIL, S_SYNC_LOST, S_SYNC_MERGED } from "./strings";

export const CODE_KEY = "lawapp_sync_code";
export const REV_KEY = "lawapp_sync_rev";
/** "1" while a local change hasn't been accepted by the server. */
export const DIRTY_KEY = "lawapp_sync_dirty";
/** {id: updatedAt} of the last server copy seen here: tells a character added here from one deleted elsewhere. */
export const BASE_KEY = "lawapp_sync_base";
/** This browser's versions of characters that lost the last merge ({at, characters}), for "Restore my version". */
export const LOST_KEY = "lawapp_sync_lost";

export { codeHint, LOOKALIKE_HINT } from "./syncCode";
/** This server needs an invite word for a new code, and it wasn't given or isn't right (LP-178). */
export const BAD_INVITE = "This server needs an invite word to turn on sync. Ask whoever runs it, then enter it below.";

export const BAD_CODE = "That doesn't look like a sync code (JSA-XXXX-XXXX-XXXX-XXXX-XXXX).";

export type SyncStatus = "off" | "loading" | "pending" | "saving" | "synced" | "conflict" | "offline" | "error";

/** Badge text per status (reference labels). */
export const BADGES: Readonly<Record<SyncStatus, string>> = {
  off: "Off",
  loading: "Loading…",
  pending: "Saving…",
  saving: "Saving…",
  synced: "Synced",
  conflict: "Synced",
  offline: "Offline",
  error: "Problem",
};

export interface SyncState {
  status: SyncStatus;
  message: string;
  /** ISO time of the last server copy seen. */
  updated: string | null;
  /** How many times a server copy replaced this browser's data (the UI redraws on change). */
  applied: number;
  /** How many of this browser's characters are kept aside after losing a merge (0: nothing to restore). */
  lost: number;
  /** The same for cases (LP-4). */
  lostCases: number;
  /** The same for precedents (LP-132). */
  lostPrecedents: number;
  /** The same for contacts (LP-30). */
  lostContacts: number;
}

/** The sync document: the export shape, with the J.A.P. inside each character, and the firm's cases (LP-4). */
export interface SyncDoc {
  characters: Array<Record<string, unknown>>;
  cases: Case[];
  /** The filing history (LP-15); absent in copies from before it. */
  filings?: Filing[];
  /** The conflict check log (LP-10); absent in copies from before it. */
  conflictChecks?: ConflictCheck[];
  /** The Law Library's precedents (LP-16); absent in copies from before it. */
  precedents?: Precedent[];
  /** The Rolodex (LP-30); absent in copies from before it. */
  contacts?: Contact[];
  /** The Ledger's time entries (LP-32); absent in copies from before it. */
  time?: TimeEntry[];
  /** The Ledger's invoices (LP-33); absent in copies from before them. */
  invoices?: Invoice[];
  /** Client retainer deposits (LP-93); absent in copies from before them. */
  retainers?: Deposit[];
  /** The firm's next-action checklists (LP-230); absent in copies from before them. */
  checklists?: Checklist[];
  /** The firm's own templates (LP-49); absent in copies from before them. */
  templates?: CustomTemplate[];
}

interface ApiBody {
  code?: string;
  rev?: number;
  data?: unknown;
  updated?: string;
  error?: string;
}

const PUSH_DELAY = 700;
const PULL_THROTTLE = 20_000;

const INITIAL: SyncState = Object.freeze({
  status: "off",
  message: "",
  updated: null,
  applied: 0,
  lost: 0,
  lostCases: 0,
  lostPrecedents: 0,
  lostContacts: 0,
});

let state: SyncState = INITIAL;
const listeners = new Set<(s: SyncState) => void>();
let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
/** Bumped by every data change, so a push knows whether anything changed while it was in flight (LP-132). */
let edits = 0;
let lastPull = 0;
let initPromise: Promise<void> | null = null;
let teardown: Array<() => void> = [];

/* ---------- local keys ---------- */

function lsGet(key: string): string | null {
  try {
    return defaultKV().get(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string | null): void {
  try {
    if (value === null) defaultKV().remove(key);
    else defaultKV().set(key, value);
  } catch {
    // ignore: sync keeps working for this tab
  }
}

/** The sync code on this device, or null when sync is off. */
export function code(): string | null {
  return lsGet(CODE_KEY);
}

function rev(): number {
  return Number(lsGet(REV_KEY) || 0) || 0;
}

/* ---------- state ---------- */

/** The current state; a new object after every change (safe for useSyncExternalStore). */
export function getState(): SyncState {
  return state;
}

/** Listen for state changes; returns the unsubscribe function. */
export function onChange(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(status: SyncStatus, message = "", updated?: string): void {
  state = Object.freeze({ ...state, status, message, updated: updated || state.updated });
  notify();
}

function setLost(lost: number, lostCases: number, lostPrecedents: number, lostContacts: number): void {
  state = Object.freeze({ ...state, lost, lostCases, lostPrecedents, lostContacts });
  notify();
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn(state);
    } catch {
      // a broken listener must not stop sync
    }
  }
}

/* ---------- HTTP ---------- */

async function request(
  method: string,
  path: string,
  body?: unknown,
  withCode: string | false | null = null,
): Promise<{ status: number; body: ApiBody | null }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (withCode !== false) headers.Authorization = "Bearer " + (withCode ?? code());
  const res = await fetch("/api/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  let json: ApiBody | null = null;
  if (res.status !== 204) {
    try {
      const parsed: unknown = await res.json();
      json = parsed && typeof parsed === "object" ? (parsed as ApiBody) : null;
    } catch {
      json = null;
    }
  }
  return { status: res.status, body: json };
}

/* ---------- local data <-> sync document ---------- */

/** This browser's data as a sync document. */
export function snapshot(): SyncDoc {
  const portfolio = portfolioStore();
  return {
    characters: characterStore()
      .list()
      .map((c) => {
        const copy = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
        const jap = portfolio.get(c.id);
        if (jap) copy.jap = jap;
        return copy;
      }),
    cases: caseStore()
      .list()
      .map((c) => JSON.parse(JSON.stringify(c)) as Case),
    ...Object.fromEntries(LISTS.map((l) => [l.key, l.store().list()])),
  };
}

/** A document's `key` list, each item cleaned, or null for a copy from before that list was synced. */
function listOf<T>(doc: unknown, key: string, clean: (x: unknown) => T | null): T[] | null {
  const raw = doc && typeof doc === "object" ? (doc as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(raw)) return null;
  return raw.map((x) => clean(x)).filter((x): x is T => !!x);
}

/** Null for a copy from before LP-93, LP-33, LP-32, LP-30, LP-16, LP-10 and LP-15 respectively. */
const timeOf = (doc: unknown) => listOf<TimeEntry>(doc, "time", cleanEntry);
const invoicesOf = (doc: unknown) => listOf<Invoice>(doc, "invoices", cleanInvoice);
const retainersOf = (doc: unknown) => listOf<Deposit>(doc, "retainers", cleanDeposit);
const checklistsOf = (doc: unknown) => listOf<Checklist>(doc, "checklists", (x) => cleanChecklist(x));
const templatesOf = (doc: unknown) => listOf<CustomTemplate>(doc, "templates", (x) => cleanTemplate(x));
const contactsOf = (doc: unknown) => listOf<Contact>(doc, "contacts", cleanContact);
const precedentsOf = (doc: unknown) => listOf<Precedent>(doc, "precedents", cleanPrecedent);
const checksOf = (doc: unknown) => listOf<ConflictCheck>(doc, "conflictChecks", cleanCheck);
const filingsOf = (doc: unknown) => listOf<Filing>(doc, "filings", cleanFiling);

/** A list that syncs item by item, with its own stamp. */
interface SyncList {
  key: string;
  of(doc: unknown): { id: string }[] | null;
  store(): { list(): { id: string }[]; replaceAll(items: unknown): void; subscribe(fn: () => void): () => void };
  /** Its items' keys in the base (BASE_KEY). */
  prefix: string;
  stamp(x: { id: string }): string;
}

const syncList = <T extends { id: string }>(
  key: keyof SyncDoc,
  of: (doc: unknown) => T[] | null,
  store: () => { list(): readonly T[]; replaceAll(items: unknown): void; subscribe(fn: () => void): () => void },
  prefix: string,
  stamp: (x: T) => string,
) => ({ key, of, store, prefix, stamp }) as unknown as SyncList;

/** A new list that syncs like these is one line here, and its type in SyncDoc. */
const LISTS: readonly SyncList[] = [
  syncList("filings", filingsOf, filingStore, "filing:", (f) => f.at),
  syncList("conflictChecks", checksOf, conflictLog, "conflict:", (c) => c.at),
  syncList("precedents", precedentsOf, precedentStore, "precedent:", (p) => p.updated),
  syncList("contacts", contactsOf, contactStore, "contact:", (c) => c.updated),
  syncList("time", timeOf, timeStore, "time:", (e) => e.updated),
  syncList("invoices", invoicesOf, invoiceStore, "invoice:", (i) => i.updated),
  syncList("retainers", retainersOf, retainerStore, "deposit:", (d) => d.updated),
  syncList("checklists", checklistsOf, checklistStore, "checklist:", (c) => c.updated),
  syncList("templates", templatesOf, templateStore, "template:", (t) => t.updated),
];

/** A document's cases; one from before LP-4 has dockets inside its characters instead. */
function casesOf(doc: unknown): Case[] {
  const raw = doc && typeof doc === "object" ? (doc as { cases?: unknown }).cases : undefined;
  if (Array.isArray(raw)) {
    return raw.filter((c): c is Doc => !!c && typeof c === "object" && !!(c as Doc).caseNumber).map(cleanCase);
  }
  return casesFromDockets(charactersOf(doc).map((c): [string, unknown] => [String(c.id), c.dockets]));
}

/**
 * Make this browser match a server document: save each character (through the
 * stores' clean()), replace its J.A.P., remove characters the document doesn't
 * have, keep the server's order, then replace the cases. Returns how many
 * characters couldn't be stored.
 */
function apply(doc: unknown): number {
  applying = true;
  state = Object.freeze({ ...state, applied: state.applied + 1 });
  const chars = characterStore();
  const dockets = docketStore();
  const portfolio = portfolioStore();
  let failed = 0;
  try {
    const keep = new Set<string>();
    const order: string[] = [];
    for (const c of charactersOf(doc)) {
      try {
        // Kept even if the save below fails: a copy that won't store must not delete this device's.
        if (typeof c.id === "string") keep.add(c.id);
        const saved = chars.save(c, { keepStamp: true });
        keep.add(saved.id);
        order.push(saved.id);
        portfolio.replace(saved.id, c.jap || null);
      } catch (err) {
        failed++;
        console.warn("[sync] couldn't store a synced character", err);
      }
    }
    for (const c of chars.list()) {
      if (!keep.has(c.id)) deleteCharacter(c.id, { characters: chars, dockets, portfolio });
    }
    order.forEach((id, i) => {
      let at = chars.list().findIndex((c) => c.id === id);
      while (at > i) {
        chars.move(id, -1);
        at--;
      }
    });
    caseStore().replaceAll(casesOf(doc));
    for (const l of LISTS) {
      const items = l.of(doc);
      if (items) l.store().replaceAll(items);
    }
  } finally {
    applying = false;
  }
  return failed;
}

/** Fold this browser's characters into a server document (the server wins on id clashes). */
export function merge(serverDoc: unknown): SyncDoc {
  const local = snapshot();
  const lists = LISTS.map((l): [string, { id: string }[]] => {
    const server = l.of(serverDoc) || [];
    const have = new Set(server.map((x) => x.id));
    const mine = ((local as unknown as Record<string, { id: string }[]>)[l.key] || []).filter((x) => !have.has(x.id));
    return [l.key, [...server, ...mine]];
  });
  const { cases, moved } = foldCases(casesOf(serverDoc), casesOf(local));
  const out: SyncDoc = {
    characters: charactersOf(serverDoc),
    cases,
    ...Object.fromEntries(lists),
  };
  relinkCases(out, moved);
  out.invoices = renumberClashes(out.invoices || []);
  const have = new Set(out.characters.map((c) => c.id));
  for (const c of local.characters) if (!have.has(c.id)) out.characters.push(c);
  return out;
}

/**
 * Point everything that links to a case at the id kept when cases merged (LP-182). A new stamp so the
 * move wins on other devices; a filing keeps its own, as it's dated by when it was filed.
 */
function relinkCases(doc: SyncDoc, moved: ReadonlyMap<string, string>): void {
  if (!moved.size) return;
  const updated = new Date().toISOString();
  const to = (id: string) => moved.get(id) ?? id;
  doc.time = doc.time?.map((e) => (moved.has(e.caseId) ? { ...e, caseId: to(e.caseId), updated } : e));
  doc.invoices = doc.invoices?.map((i) => (moved.has(i.caseId) ? { ...i, caseId: to(i.caseId), updated } : i));
  doc.filings = doc.filings?.map((x) => (x.caseId && moved.has(x.caseId) ? { ...x, caseId: to(x.caseId) } : x));
  doc.contacts = doc.contacts?.map((c) => {
    if (!c.cases?.some((l) => moved.has(l.id))) return c;
    const links = c.cases.map((l) => ({ ...l, id: to(l.id) }));
    return { ...c, cases: links.filter((l, i) => links.findIndex((x) => x.id === l.id) === i), updated };
  });
}

type Doc = Record<string, unknown>;

function charactersOf(doc: unknown): Doc[] {
  const raw = doc && typeof doc === "object" ? (doc as { characters?: unknown }).characters : undefined;
  return Array.isArray(raw) ? raw.filter((c): c is Doc => !!c && typeof c === "object") : [];
}

/** A character's updatedAt; "" (older than any stamp) for data saved before stamps existed. */
function stampOf(c: Doc): string {
  return typeof c.updatedAt === "string" ? c.updatedAt : "";
}

function readBase(): Map<string, string> | null {
  try {
    const o: unknown = JSON.parse(lsGet(BASE_KEY) || "null");
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    return new Map(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return null;
  }
}

/** Remember the server copy's stamps: characters by id, cases as "case:<id>" (LP-4). */
function saveBase(doc: unknown): void {
  const o: Record<string, string> = {};
  for (const c of charactersOf(doc)) if (typeof c.id === "string") o[c.id] = stampOf(c);
  for (const c of casesOf(doc)) o["case:" + c.id] = c.updated;
  for (const l of LISTS) for (const x of l.of(doc) || []) o[l.prefix + x.id] = l.stamp(x);
  lsSet(BASE_KEY, JSON.stringify(o));
}

export interface Resolved {
  doc: SyncDoc;
  /** This browser's versions that lost and had changed here since the last server copy. */
  lost: Doc[];
  /** The same for cases (LP-4). */
  lostCases: Case[];
  /** The same for precedents (LP-132). */
  lostPrecedents: Precedent[];
  /** The same for contacts (LP-30). */
  lostContacts: Contact[];
  /** True when the result holds anything of this browser's, so it must be pushed. */
  keptLocal: boolean;
}

/**
 * Merge this browser's characters into a newer server copy, one character at a
 * time (dockets and J.A.P. go with their character). The newer updatedAt wins
 * and the server wins a tie. `base`, the last server copy seen here, tells a
 * character added on one side from one deleted on the other; without it (sync
 * set up before this existed) nothing is treated as deleted.
 */
export function resolve(serverDoc: unknown, base: Map<string, string> | null = readBase()): Resolved {
  // Characters are stamped in the base under their bare id. A server id that isn't a string
  // still matches the same local character (LP-139).
  const chars = resolveList(
    charactersOf(serverDoc).map((s) => ({ ...s, id: String(s.id) })),
    snapshot().characters as Array<Doc & { id: string }>,
    base,
    "",
    stampOf,
  );

  // Cases (LP-4): the same rules, one case at a time, by each case's own `updated`.
  const cases = resolveList(casesOf(serverDoc), caseStore().list(), base, "case:", (c) => c.updated);
  // The other lists likewise, each by its own stamp. Only precedents and contacts keep a losing edit.
  const merged = new Map(
    LISTS.map((l) => [l.key, mergeOptional(l.of(serverDoc), l.store().list(), base, l.prefix, l.stamp)]),
  );
  const invoices = merged.get("invoices") as ReturnType<typeof mergeOptional<Invoice>>;
  const paid = keepBothPayments(invoices.out, invoicesOf(serverDoc) || [], invoiceStore().list(), base);
  const numbered = renumberClashes(paid);
  // Two devices can make the same case number separately: they become one case.
  const unified = foldCases(cases.out);
  const doc: SyncDoc = {
    characters: chars.out,
    cases: unified.cases,
    ...Object.fromEntries([...merged].map(([key, m]) => [key, m.out])),
    invoices: numbered,
  };
  relinkCases(doc, unified.moved);
  return {
    doc,
    lost: chars.lost,
    lostCases: cases.lost,
    lostPrecedents: merged.get("precedents")!.lost as Precedent[],
    lostContacts: merged.get("contacts")!.lost as Contact[],
    keptLocal:
      chars.keptLocal ||
      cases.keptLocal ||
      [...merged.values()].some((m) => m.keptLocal) ||
      unified.moved.size > 0 ||
      numbered.some((inv, i) => inv !== invoices.out[i]),
  };
}

/**
 * An invoice changed on both devices since the last sync keeps the payments of both (LP-177): the newer
 * copy wins the rest. A payment removed on one of them comes back, which shows, where a lost one wouldn't.
 */
function keepBothPayments(
  merged: Invoice[],
  server: Invoice[],
  local: Invoice[],
  base: Map<string, string> | null,
): Invoice[] {
  const serverById = new Map(server.map((i) => [i.id, i]));
  const localById = new Map(local.map((i) => [i.id, i]));
  return merged.map((inv) => {
    const s = serverById.get(inv.id);
    const l = localById.get(inv.id);
    const was = base?.get("invoice:" + inv.id);
    if (!s || !l || s.updated === was || l.updated === was) return inv;
    const have = new Set(inv.payments.map((p) => p.id));
    const missing = [...s.payments, ...l.payments].filter((p) => !have.has(p.id));
    return missing.length
      ? { ...inv, payments: [...inv.payments, ...missing], updated: new Date().toISOString() }
      : inv;
  });
}

/**
 * Merge one list of items with their own stamps (characters, cases, filings…):
 * the newer stamp wins and the server wins a tie; `base`
 * (under `prefix + id`) tells an item added on one side from one deleted on
 * the other. Returns the result, this browser's losing edits, and whether the
 * result holds anything of this browser's.
 */
function resolveList<T extends { id: string }>(
  server: T[],
  local: T[],
  base: Map<string, string> | null,
  prefix: string,
  stamp: (x: T) => string,
): { out: T[]; lost: T[]; keptLocal: boolean } {
  const localById = new Map(local.map((x) => [x.id, x]));
  const baseOf = (id: string) => base?.get(prefix + id);
  const changedHere = (x: T) => !base || baseOf(x.id) !== stamp(x);
  const out: T[] = [];
  const lost: T[] = [];
  let keptLocal = false;
  const seen = new Set<string>();
  for (const s of server) {
    seen.add(s.id);
    const l = localById.get(s.id);
    if (!l) {
      // Deleted here: that stands unless the other device has changed it since.
      if (baseOf(s.id) === stamp(s)) keptLocal = true;
      else out.push(s);
      continue;
    }
    if (stamp(l) > stamp(s)) {
      out.push(l);
      keptLocal = true;
    } else {
      out.push(s);
      if (stamp(l) !== stamp(s) && changedHere(l)) lost.push(l);
    }
  }
  for (const [id, l] of localById) {
    if (seen.has(id)) continue;
    if (baseOf(id) !== undefined) {
      // Deleted on the other device; keep this browser's edits to it aside.
      if (changedHere(l)) lost.push(l);
      continue;
    }
    out.push(l);
    keptLocal = true;
  }
  return { out, lost, keptLocal };
}

/** resolveList for a list a server copy from before it was synced doesn't have: this browser's are kept and sent. */
function mergeOptional<T extends { id: string }>(
  server: T[] | null,
  local: T[],
  base: Map<string, string> | null,
  prefix: string,
  stamp: (x: T) => string,
): { out: T[]; lost: T[]; keptLocal: boolean } {
  return server
    ? resolveList(server, local, base, prefix, stamp)
    : { out: local, lost: [], keptLocal: local.length > 0 };
}

/** The versions kept aside by earlier merges (LOST_KEY), read once. */
function readLostDoc(): { characters: Doc[]; cases: Case[]; precedents: Precedent[]; contacts: Contact[] } {
  try {
    const o: unknown = JSON.parse(lsGet(LOST_KEY) || "null");
    const cases = o && typeof o === "object" ? (o as { cases?: unknown }).cases : undefined;
    return {
      characters: charactersOf(o),
      cases: Array.isArray(cases) ? casesOf({ cases }) : [],
      precedents: precedentsOf(o) || [],
      contacts: contactsOf(o) || [],
    };
  } catch {
    return { characters: [], cases: [], precedents: [], contacts: [] };
  }
}

/**
 * Put this browser's versions back after a merge chose another device's: each
 * is saved with a fresh updatedAt (so it wins the next merge) and pushed.
 * Returns how many were restored.
 */
export function restoreLost(): number {
  const chars = characterStore();
  const dockets = docketStore();
  const portfolio = portfolioStore();
  let restored = 0;
  const kept = readLostDoc();
  for (const c of kept.characters) {
    try {
      const saved = chars.save(c);
      // A version kept aside before LP-4 still has its docket inside.
      if (Array.isArray(c.dockets)) dockets.replace(saved.id, c.dockets);
      portfolio.replace(saved.id, c.jap || null);
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a character", err);
    }
  }
  for (const c of kept.cases) {
    try {
      caseStore().save(c); // a fresh `updated`, so it wins the next merge
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a case", err);
    }
  }
  for (const p of kept.precedents) {
    try {
      precedentStore().save(p); // a fresh `updated` too
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a precedent", err);
    }
  }
  for (const c of kept.contacts) {
    try {
      contactStore().save({ ...c, cases: c.cases ?? [] }); // exactly this version, with a fresh `updated`
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a contact", err);
    }
  }
  discardLost();
  return restored;
}

/** Forget the kept-aside versions. */
export function discardLost(): void {
  lsSet(LOST_KEY, null);
  setLost(0, 0, 0, 0);
}

/** Set `status` after applying a server copy, unless some characters failed to store. */
function setAfterApply(failed: number, status: SyncStatus, message: string, updated?: string): void {
  if (failed) set("error", S_SYNC_APPLY_FAIL(failed), updated);
  else set(status, message, updated);
}

/* ---------- push / pull ---------- */

/**
 * Take a server copy newer than this browser's. With unsent edits the two are
 * merged (see resolve) instead of the server copy replacing them. Returns true
 * when the result kept something of this browser's, so it needs pushing.
 */
function takeServer(b: ApiBody, dirty: boolean): boolean {
  lsSet(REV_KEY, String(b.rev));
  if (!dirty) {
    const failed = apply(b.data);
    saveBase(b.data);
    lsSet(DIRTY_KEY, null);
    setAfterApply(failed, "synced", "Updated from the server.", b.updated);
    return false;
  }
  const { doc, lost, lostCases, lostPrecedents, lostContacts, keptLocal } = resolve(b.data);
  saveBase(b.data);
  const anyLost = lost.length + lostCases.length + lostPrecedents.length + lostContacts.length > 0;
  if (anyLost) {
    // Add to anything not yet restored; a newer copy of the same item replaces the older one.
    const kept = readLostDoc();
    const all = replaceById(kept.characters, lost);
    const allCases = replaceById(kept.cases, lostCases);
    const allPrecedents = replaceById(kept.precedents, lostPrecedents);
    const allContacts = replaceById(kept.contacts, lostContacts);
    lsSet(
      LOST_KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        characters: all,
        cases: allCases,
        precedents: allPrecedents,
        contacts: allContacts,
      }),
    );
    setLost(all.length, allCases.length, allPrecedents.length, allContacts.length);
  }
  const failed = apply(doc);
  lsSet(DIRTY_KEY, keptLocal ? "1" : null);
  setAfterApply(
    failed,
    anyLost ? "conflict" : "synced",
    anyLost
      ? S_SYNC_LOST(lost.length, lostCases.length, lostPrecedents.length, lostContacts.length)
      : keptLocal
        ? S_SYNC_MERGED
        : "Updated from the server.",
    b.updated,
  );
  return keptLocal;
}

/** Send this browser's data. Pushes are serialised: a push during another waits for it. */
export function push(): Promise<void> {
  return send(true);
}

/** One PUT; after a 409 the merged copy is sent once more (`retry`). */
function send(retry: boolean): Promise<void> {
  if (!code()) return Promise.resolve();
  if (inflight) return inflight.then(() => send(retry));
  set("saving", "Saving…");
  const sent = snapshot();
  const editsSent = edits;
  let again = false;
  inflight = request("PUT", "data", { rev: rev(), data: sent })
    .then(
      (r) => {
        const b = r.body || {};
        if (r.status === 200) {
          lsSet(REV_KEY, String(b.rev));
          // An edit made during the request isn't in `sent`: it stays unsent (LP-132).
          if (edits === editsSent) lsSet(DIRTY_KEY, null);
          saveBase(sent);
          set("synced", "", b.updated);
          return;
        }
        if (r.status === 409) {
          // This browser was sending its own data, so treat it as unsent edits.
          again = takeServer(b, true) && retry;
          return;
        }
        if (r.status === 404 || r.status === 401) {
          set("error", "The server doesn't recognise this sync code any more. Turn sync off and on again.");
          return;
        }
        set(
          "error",
          b.error ||
            "Couldn't save to the server (" +
              r.status +
              "). Changes are kept in this browser and will be sent next time.",
        );
      },
      () => {
        set("offline", "Can't reach the server. Changes are kept in this browser and will be sent when it's back.");
      },
    )
    .then(() => {
      inflight = null;
      if (again) return send(false);
    });
  return inflight;
}

/** Fetch the server copy (throttled to once per 20 s unless forced). Resolves true when the server answered 200. */
export async function pull(force = false): Promise<boolean> {
  if (!code()) return false;
  if (!force && Date.now() - lastPull < PULL_THROTTLE) return false;
  lastPull = Date.now();
  let r: { status: number; body: ApiBody | null };
  try {
    r = await request("GET", "data");
  } catch {
    set("offline", "Can't reach the server. Using the copy saved in this browser.");
    return false;
  }
  const b = r.body || {};
  if (r.status === 200) {
    // A reply older than this copy, sent before a save that has since finished: nothing to learn from it.
    if (typeof b.rev === "number" && b.rev < rev()) return true;
    // LP-71: a server copy still carrying the pre-LP-70 `server` field is sent back clean
    // (this browser's copy never has it), so every other device gets it clean too.
    const stale = charactersOf(b.data).some((c) => "server" in c);
    let pushed = false;
    if (b.rev !== rev()) {
      if (takeServer(b, !!lsGet(DIRTY_KEY))) {
        await push();
        pushed = true;
      }
    } else {
      saveBase(b.data); // the copy this browser last synced with
      if (lsGet(DIRTY_KEY)) {
        await push(); // send edits made while offline
        pushed = true;
      } else if (state.status !== "synced") set("synced", "", b.updated);
    }
    if (stale && !pushed) {
      lsSet(DIRTY_KEY, "1");
      await push();
    }
    return true;
  }
  if (r.status === 404 || r.status === 401) set("error", "The server doesn't recognise this sync code.");
  else set("error", b.error || "Couldn't load from the server (" + r.status + ").");
  return false;
}

/** Called after any data change in the stores (never for the active-character switch). */
function changed(): void {
  if (applying || fromOtherTab() || !code()) return;
  edits++;
  lsSet(DIRTY_KEY, "1");
  if (timer) clearTimeout(timer);
  set("pending", "Saving…");
  timer = setTimeout(() => {
    timer = null;
    void push();
  }, PUSH_DELAY);
}

/* ---------- turning sync on and off ---------- */

/** Create a new code on the server and upload this browser's data. Resolves with the code. */
export async function enable(invite = ""): Promise<string> {
  const r = await request("POST", "account", invite ? { invite } : {}, false);
  const b = r.body || {};
  if (r.status === 403) throw new Error(BAD_INVITE);
  if (r.status !== 201 || typeof b.code !== "string")
    throw new Error(b.error || "The server refused (" + r.status + ").");
  lsSet(CODE_KEY, b.code);
  lsSet(REV_KEY, "0");
  // Unsent until the server has it: if this send fails, a later pull must not take the server's copy over it.
  lsSet(DIRTY_KEY, "1");
  await push();
  return b.code;
}

/** Use an existing code: fetch its data, fold in this browser's characters, apply, and upload the result. */
export async function link(typed: string): Promise<void> {
  const c = normaliseCode(String(typed || ""));
  if (!CODE_RE.test(c)) throw new Error(/[OI01]/.test(c.slice(3)) ? LOOKALIKE_HINT : BAD_CODE);
  const r = await request("GET", "data", undefined, c);
  const b = r.body || {};
  if (r.status === 404) throw new Error("No synced data for that code. Check it was typed correctly.");
  if (r.status !== 200) throw new Error(b.error || "The server refused (" + r.status + ").");
  lsSet(CODE_KEY, c);
  lsSet(REV_KEY, String(b.rev));
  const failed = apply(merge(b.data));
  setAfterApply(failed, "synced", "", b.updated);
  // Unsent until the server has it: if this send fails, a later pull must not take the server's copy over it.
  lsSet(DIRTY_KEY, "1");
  await push();
}

/** Stop syncing on this device. Local copies stay. */
export function disable(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  lsSet(CODE_KEY, null);
  lsSet(REV_KEY, null);
  lsSet(DIRTY_KEY, null);
  lsSet(BASE_KEY, null);
  set("off");
}

/** Delete the server copy (every device loses sync; local copies stay). */
export async function destroy(): Promise<void> {
  const r = await request("DELETE", "account");
  if (r.status !== 204 && r.status !== 404) {
    throw new Error((r.body && r.body.error) || "The server refused (" + r.status + ").");
  }
  disable();
}

/**
 * Start sync once per page: subscribe to the stores' data channels, listen for
 * visibilitychange/online, and do a forced first pull when a code is set.
 * Further calls return the same promise.
 */
export function init(): Promise<void> {
  if (initPromise) return initPromise;
  const unsubs = [
    characterStore().subscribe(changed),
    caseStore().subscribe(changed),
    ...LISTS.map((l) => l.store().subscribe(changed)),
    portfolioStore().subscribe(changed),
  ];
  const onVisible = () => {
    if (!document.hidden) void pull();
  };
  const onOnline = () => {
    if (code()) void push();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  teardown = [
    ...unsubs,
    () => document.removeEventListener("visibilitychange", onVisible),
    () => window.removeEventListener("online", onOnline),
  ];
  const kept = readLostDoc();
  if (kept.characters.length || kept.cases.length || kept.precedents.length || kept.contacts.length) {
    setLost(kept.characters.length, kept.cases.length, kept.precedents.length, kept.contacts.length);
  }
  initPromise = (async () => {
    if (code()) {
      set("loading", "Loading from the server…");
      await pull(true);
    }
  })();
  return initPromise;
}

/** Test-only: remove listeners and subscriptions and forget all module state. Not used by app code. */
export function __resetForTests(): void {
  for (const fn of teardown) fn();
  teardown = [];
  if (timer) clearTimeout(timer);
  timer = null;
  initPromise = null;
  inflight = null;
  edits = 0;
  lastPull = 0;
  applying = false;
  state = INITIAL;
  listeners.clear();
}
