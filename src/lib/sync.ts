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
// filing history (LP-15) and the conflict check log (LP-10) sync the same way,
// one entry at a time. This
// browser's versions that lose are kept under lawapp_sync_lost so the user can
// restore them.
//
// The code lives in local storage under lawapp_sync_code and is only ever sent
// to /api/ in the Authorization header. Client only: nothing runs at import.
import { caseStore, casesFromDockets, cleanCase, unifyCases } from "./cases";
import { characterStore } from "./characters";
import { cleanCheck, conflictLog, type ConflictCheck } from "./conflicts";
import { cleanFiling, filingStore, type Filing } from "./filings";
import { cleanPrecedent, precedentStore, type Precedent } from "./precedents";
import { docketStore } from "./dockets";
import { portfolioStore } from "./portfolio";
import { deleteCharacter } from "./services/characters";
import { defaultKV } from "./storage";
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

/** Same accept rule as the server (src/lib/server/code.ts). */
export const CODE_RE = /^JSA(-[A-Z0-9]{4}){5}$/;

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

function setLost(lost: number, lostCases: number, lostPrecedents: number): void {
  state = Object.freeze({ ...state, lost, lostCases, lostPrecedents });
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
    filings: filingStore().list(),
    conflictChecks: conflictLog().list(),
    precedents: precedentStore().list(),
  };
}

/** A document's precedents, or null for a copy from before LP-16. */
function precedentsOf(doc: unknown): Precedent[] | null {
  const raw = doc && typeof doc === "object" ? (doc as { precedents?: unknown }).precedents : undefined;
  if (!Array.isArray(raw)) return null;
  return raw.map((p) => cleanPrecedent(p)).filter((p): p is Precedent => !!p);
}

/** A document's filing history, or null for a copy from before LP-15 (which has none to apply). */
/** A document's conflict check log, or null for a copy from before LP-10. */
function checksOf(doc: unknown): ConflictCheck[] | null {
  const raw = doc && typeof doc === "object" ? (doc as { conflictChecks?: unknown }).conflictChecks : undefined;
  if (!Array.isArray(raw)) return null;
  return raw.map(cleanCheck).filter((c): c is ConflictCheck => !!c);
}

function filingsOf(doc: unknown): Filing[] | null {
  const raw = doc && typeof doc === "object" ? (doc as { filings?: unknown }).filings : undefined;
  if (!Array.isArray(raw)) return null;
  return raw.map(cleanFiling).filter((f): f is Filing => !!f);
}

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
    const raw = doc && typeof doc === "object" ? (doc as { characters?: unknown }).characters : undefined;
    const incoming = Array.isArray(raw) ? raw : [];
    const keep = new Set<string>();
    const order: string[] = [];
    for (const item of incoming) {
      try {
        const c = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
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
    const filings = filingsOf(doc);
    if (filings) filingStore().replaceAll(filings);
    const checks = checksOf(doc);
    if (checks) conflictLog().replaceAll(checks);
    const precedents = precedentsOf(doc);
    if (precedents) precedentStore().replaceAll(precedents);
  } finally {
    applying = false;
  }
  return failed;
}

/** Fold this browser's characters into a server document (the server wins on id clashes). */
export function merge(serverDoc: unknown): SyncDoc {
  const raw =
    serverDoc && typeof serverDoc === "object" ? (serverDoc as { characters?: unknown }).characters : undefined;
  const list = Array.isArray(raw) ? raw.filter((c): c is Record<string, unknown> => !!c && typeof c === "object") : [];
  const local = snapshot();
  const serverFilings = filingsOf(serverDoc) || [];
  const haveFiling = new Set(serverFilings.map((f) => f.id));
  const serverChecks = checksOf(serverDoc) || [];
  const haveCheck = new Set(serverChecks.map((c) => c.id));
  const serverPrecedents = precedentsOf(serverDoc) || [];
  const havePrecedent = new Set(serverPrecedents.map((p) => p.id));
  const out: SyncDoc = {
    characters: list.slice(),
    cases: unifyCases(casesOf(serverDoc), casesOf(local)),
    filings: [...serverFilings, ...(local.filings || []).filter((f) => !haveFiling.has(f.id))],
    conflictChecks: [...serverChecks, ...(local.conflictChecks || []).filter((c) => !haveCheck.has(c.id))],
    precedents: [...serverPrecedents, ...(local.precedents || []).filter((p) => !havePrecedent.has(p.id))],
  };
  const have = new Set(out.characters.map((c) => c.id));
  for (const c of local.characters) if (!have.has(c.id)) out.characters.push(c);
  return out;
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
  for (const f of filingsOf(doc) || []) o["filing:" + f.id] = f.at;
  for (const c of checksOf(doc) || []) o["conflict:" + c.id] = c.at;
  for (const p of precedentsOf(doc) || []) o["precedent:" + p.id] = p.updated;
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
  // Filings (LP-15) likewise, by when each was filed. A copy from before LP-15 has none:
  // this browser's are kept and sent.
  const localFilings = filingStore().list();
  const serverFilings = filingsOf(serverDoc);
  const filings = serverFilings
    ? resolveList(serverFilings, localFilings, base, "filing:", (f) => f.at)
    : { out: localFilings, lost: [], keptLocal: localFilings.length > 0 };
  // The conflict check log (LP-10), the same way.
  const localChecks = conflictLog().list();
  const serverChecks = checksOf(serverDoc);
  const checks = serverChecks
    ? resolveList(serverChecks, localChecks, base, "conflict:", (c) => c.at)
    : { out: localChecks, lost: [], keptLocal: localChecks.length > 0 };
  // Precedents (LP-16): edited like cases, so the newer `updated` wins each ruling.
  const localPrecedents = precedentStore().list();
  const serverPrecedents = precedentsOf(serverDoc);
  const precedents = serverPrecedents
    ? resolveList(serverPrecedents, localPrecedents, base, "precedent:", (p) => p.updated)
    : { out: localPrecedents, lost: [], keptLocal: localPrecedents.length > 0 };
  return {
    // Two devices can make the same case number separately: they become one case.
    doc: {
      characters: chars.out,
      cases: unifyCases(cases.out),
      filings: filings.out,
      conflictChecks: checks.out,
      precedents: precedents.out,
    },
    lost: chars.lost,
    lostCases: cases.lost,
    lostPrecedents: precedents.lost,
    keptLocal: chars.keptLocal || cases.keptLocal || filings.keptLocal || checks.keptLocal || precedents.keptLocal,
  };
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

function readLost(): Doc[] {
  try {
    const o: unknown = JSON.parse(lsGet(LOST_KEY) || "null");
    return o && typeof o === "object" ? charactersOf(o) : [];
  } catch {
    return [];
  }
}

function readLostCases(): Case[] {
  try {
    const o: unknown = JSON.parse(lsGet(LOST_KEY) || "null");
    const raw = o && typeof o === "object" ? (o as { cases?: unknown }).cases : undefined;
    return Array.isArray(raw) ? casesOf({ cases: raw }) : [];
  } catch {
    return [];
  }
}

function readLostPrecedents(): Precedent[] {
  try {
    return precedentsOf(JSON.parse(lsGet(LOST_KEY) || "null")) || [];
  } catch {
    return [];
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
  for (const c of readLost()) {
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
  for (const c of readLostCases()) {
    try {
      caseStore().save(c); // a fresh `updated`, so it wins the next merge
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a case", err);
    }
  }
  for (const p of readLostPrecedents()) {
    try {
      precedentStore().save(p); // a fresh `updated` too
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a precedent", err);
    }
  }
  discardLost();
  return restored;
}

/** Forget the kept-aside versions. */
export function discardLost(): void {
  lsSet(LOST_KEY, null);
  setLost(0, 0, 0);
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
  const { doc, lost, lostCases, lostPrecedents, keptLocal } = resolve(b.data);
  saveBase(b.data);
  const anyLost = lost.length + lostCases.length + lostPrecedents.length > 0;
  if (anyLost) {
    // Add to anything not yet restored; a newer copy of the same item replaces the older one.
    const ids = new Set(lost.map((c) => c.id));
    const all = [...readLost().filter((c) => !ids.has(c.id)), ...lost];
    const caseIds = new Set(lostCases.map((c) => c.id));
    const allCases = [...readLostCases().filter((c) => !caseIds.has(c.id)), ...lostCases];
    const precedentIds = new Set(lostPrecedents.map((p) => p.id));
    const allPrecedents = [...readLostPrecedents().filter((p) => !precedentIds.has(p.id)), ...lostPrecedents];
    lsSet(
      LOST_KEY,
      JSON.stringify({ at: new Date().toISOString(), characters: all, cases: allCases, precedents: allPrecedents }),
    );
    setLost(all.length, allCases.length, allPrecedents.length);
  }
  const failed = apply(doc);
  lsSet(DIRTY_KEY, keptLocal ? "1" : null);
  setAfterApply(
    failed,
    anyLost ? "conflict" : "synced",
    anyLost
      ? S_SYNC_LOST(lost.length, lostCases.length, lostPrecedents.length)
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
  if (applying || !code()) return;
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
export async function enable(): Promise<string> {
  const r = await request("POST", "account", {}, false);
  const b = r.body || {};
  if (r.status !== 201 || typeof b.code !== "string")
    throw new Error(b.error || "The server refused (" + r.status + ").");
  lsSet(CODE_KEY, b.code);
  lsSet(REV_KEY, "0");
  await push();
  return b.code;
}

/** Use an existing code: fetch its data, fold in this browser's characters, apply, and upload the result. */
export async function link(typed: string): Promise<void> {
  const c = String(typed || "")
    .trim()
    .toUpperCase();
  if (!CODE_RE.test(c)) throw new Error(BAD_CODE);
  const r = await request("GET", "data", undefined, c);
  const b = r.body || {};
  if (r.status === 404) throw new Error("No synced data for that code. Check it was typed correctly.");
  if (r.status !== 200) throw new Error(b.error || "The server refused (" + r.status + ").");
  lsSet(CODE_KEY, c);
  lsSet(REV_KEY, String(b.rev));
  const failed = apply(merge(b.data));
  setAfterApply(failed, "synced", "", b.updated);
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
    filingStore().subscribe(changed),
    conflictLog().subscribe(changed),
    precedentStore().subscribe(changed),
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
  const lost = readLost().length;
  const lostCases = readLostCases().length;
  const lostPrecedents = readLostPrecedents().length;
  if (lost || lostCases || lostPrecedents) setLost(lost, lostCases, lostPrecedents);
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
