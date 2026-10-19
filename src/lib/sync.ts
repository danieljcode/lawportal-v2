// Sync client: keeps characters, dockets and J.A.P. portfolios in step with
// this app's own server (design §Sync client; behaviour per INV §e.4).
//
// Turned on per browser with a sync code. The server copy is the master and
// this browser's storage is a cache of it. Every data change is pushed 700 ms
// after it happens; the latest copy is pulled on init and when the tab comes
// back into view (at most every 20 s unless forced). If another device saved
// in between (a 409 on push, or a newer rev on pull while this browser has
// unsent edits), the two copies are merged one character at a time: the newer
// updatedAt wins, and dockets and J.A.P. go with their character. This
// browser's versions that lose are kept under lawapp_sync_lost so the user can
// restore them.
//
// The code lives in local storage under lawapp_sync_code and is only ever sent
// to /api/ in the Authorization header. Client only: nothing runs at import.
import { characterStore } from "./characters";
import { docketStore } from "./dockets";
import { portfolioStore } from "./portfolio";
import { deleteCharacter } from "./services/characters";
import { defaultKV } from "./storage";
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
}

/** The sync document: the export shape, with dockets and J.A.P. inside each character. */
export interface SyncDoc {
  characters: Array<Record<string, unknown>>;
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

const INITIAL: SyncState = Object.freeze({ status: "off", message: "", updated: null, applied: 0, lost: 0 });

let state: SyncState = INITIAL;
const listeners = new Set<(s: SyncState) => void>();
let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
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

function setLost(lost: number): void {
  state = Object.freeze({ ...state, lost });
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
  const dockets = docketStore();
  const portfolio = portfolioStore();
  return {
    characters: characterStore()
      .list()
      .map((c) => {
        const copy = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
        const d = dockets.list(c.id);
        if (d.length) copy.dockets = d;
        const jap = portfolio.get(c.id);
        if (jap) copy.jap = jap;
        return copy;
      }),
  };
}

/**
 * Make this browser match a server document: save each character (through the
 * stores' clean()), replace its dockets and J.A.P., remove characters the
 * document doesn't have, and keep the server's order. Returns how many
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
        dockets.replace(saved.id, Array.isArray(c.dockets) ? c.dockets : []);
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
  const out: SyncDoc = { characters: list.slice() };
  const have = new Set(out.characters.map((c) => c.id));
  for (const c of snapshot().characters) if (!have.has(c.id)) out.characters.push(c);
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

function saveBase(chars: Doc[]): void {
  const o: Record<string, string> = {};
  for (const c of chars) if (typeof c.id === "string") o[c.id] = stampOf(c);
  lsSet(BASE_KEY, JSON.stringify(o));
}

export interface Resolved {
  doc: SyncDoc;
  /** This browser's versions that lost and had changed here since the last server copy. */
  lost: Doc[];
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
  const local = new Map<string, Doc>();
  for (const c of snapshot().characters) local.set(c.id as string, c);
  const changedHere = (c: Doc) => !base || base.get(c.id as string) !== stampOf(c);
  const out: Doc[] = [];
  const lost: Doc[] = [];
  let keptLocal = false;
  const seen = new Set<string>();
  for (const s of charactersOf(serverDoc)) {
    const id = String(s.id);
    seen.add(id);
    const l = local.get(id);
    if (!l) {
      // Deleted here: that stands unless the other device has changed it since.
      if (base?.get(id) === stampOf(s)) keptLocal = true;
      else out.push(s);
      continue;
    }
    if (stampOf(l) > stampOf(s)) {
      out.push(l);
      keptLocal = true;
    } else {
      out.push(s);
      if (stampOf(l) !== stampOf(s) && changedHere(l)) lost.push(l);
    }
  }
  for (const [id, l] of local) {
    if (seen.has(id)) continue;
    if (base?.has(id)) {
      // Deleted on the other device; keep this browser's edits to it aside.
      if (changedHere(l)) lost.push(l);
      continue;
    }
    out.push(l);
    keptLocal = true;
  }
  return { doc: { characters: out }, lost, keptLocal };
}

function readLost(): Doc[] {
  try {
    const o: unknown = JSON.parse(lsGet(LOST_KEY) || "null");
    return o && typeof o === "object" ? charactersOf(o) : [];
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
      dockets.replace(saved.id, Array.isArray(c.dockets) ? c.dockets : []);
      portfolio.replace(saved.id, c.jap || null);
      restored++;
    } catch (err) {
      console.warn("[sync] couldn't restore a character", err);
    }
  }
  discardLost();
  return restored;
}

/** Forget the kept-aside versions. */
export function discardLost(): void {
  lsSet(LOST_KEY, null);
  setLost(0);
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
  const server = charactersOf(b.data);
  if (!dirty) {
    const failed = apply(b.data);
    saveBase(server);
    lsSet(DIRTY_KEY, null);
    setAfterApply(failed, "synced", "Updated from the server.", b.updated);
    return false;
  }
  const { doc, lost, keptLocal } = resolve(b.data);
  saveBase(server);
  if (lost.length) {
    // Add to anything not yet restored; a newer copy of the same character replaces the older one.
    const ids = new Set(lost.map((c) => c.id));
    const all = [...readLost().filter((c) => !ids.has(c.id)), ...lost];
    lsSet(LOST_KEY, JSON.stringify({ at: new Date().toISOString(), characters: all }));
    setLost(all.length);
  }
  const failed = apply(doc);
  lsSet(DIRTY_KEY, keptLocal ? "1" : null);
  setAfterApply(
    failed,
    lost.length ? "conflict" : "synced",
    lost.length ? S_SYNC_LOST(lost.length) : keptLocal ? S_SYNC_MERGED : "Updated from the server.",
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
  let again = false;
  inflight = request("PUT", "data", { rev: rev(), data: sent })
    .then(
      (r) => {
        const b = r.body || {};
        if (r.status === 200) {
          lsSet(REV_KEY, String(b.rev));
          lsSet(DIRTY_KEY, null);
          saveBase(sent.characters);
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
      saveBase(charactersOf(b.data)); // the copy this browser last synced with
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
    docketStore().subscribe(changed),
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
  if (lost) setLost(lost);
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
  lastPull = 0;
  applying = false;
  state = INITIAL;
  listeners.clear();
}
