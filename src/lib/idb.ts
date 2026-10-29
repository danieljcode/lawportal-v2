// IndexedDB behind the KV interface (LP-36): room to grow past localStorage's ~5 MB.
//
// openIdbKV loads every value into memory once, before the app renders, so reads
// stay synchronous and the stores don't change. A write updates memory at once;
// every write made in the same task is saved in one IndexedDB transaction, so a
// multi-key change (a character and its docket) is saved whole or not at all. A
// failed save keeps its writes for the next one and raises the save-failed
// notice. Other tabs hear each saved change over a BroadcastChannel.
//
// The first open moves localStorage's app data in, and clears it only once the
// copy reads back the same. The keys read straight from localStorage before the
// app loads (the theme script, the boot screen) stay there: LOCAL_KEYS.

import { BOOT_OFF_KEY } from "./boot";
import { READABLE_FONT_KEY, SHELL_KEY } from "./shell";
import { memoryKV, reportSaveFailed, setDefaultKV, type KV } from "./storage";
import { THEME_KEY } from "./theme";

const DB = "lawapp";
const STORE = "kv";
const PREFIX = "lawapp_";

/** How long to wait for IndexedDB before the app starts without it. */
export const OPEN_TIMEOUT_MS = 10_000;

/** In localStorage once its data has moved: from then on IndexedDB holds it (not a KV key, never backed up). */
export const IDB_MARKER = "lawapp_idb";

export const LOCAL_KEYS: ReadonlySet<string> = new Set([THEME_KEY, SHELL_KEY, READABLE_FONT_KEY, BOOT_OFF_KEY]);

type Op = [key: string, value: string | null];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function readAll(db: IDBDatabase): Promise<Map<string, string>> {
  const s = db.transaction(STORE, "readonly").objectStore(STORE);
  const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
  return new Map(keys.map((k, i) => [String(k), String(values[i])]));
}

/** localStorage's app data: every lawapp_ key but LOCAL_KEYS. */
function localData(ls: Storage): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k === null || !k.startsWith(PREFIX) || LOCAL_KEYS.has(k) || k === IDB_MARKER) continue;
    const v = ls.getItem(k);
    if (v !== null) out.set(k, v);
  }
  return out;
}

/**
 * Open IndexedDB, move localStorage's app data into it, and return it as a KV,
 * or null when the move didn't check out (localStorage is then left as it was).
 * `gaveUp()` true means the caller stopped waiting: nothing is cleared.
 */
export async function openIdbKV(gaveUp: () => boolean = () => false): Promise<KV | null> {
  const ls = globalThis.localStorage;
  const opening = globalThis.indexedDB.open(DB, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
  const db = await req(opening);

  const moving = localData(ls);
  if (moving.size > 0) {
    const tx = db.transaction(STORE, "readwrite");
    for (const [k, v] of moving) tx.objectStore(STORE).put(v, k);
    await done(tx);
  }
  const map = await readAll(db);
  for (const [k, v] of moving) if (map.get(k) !== v) return null;
  if (gaveUp()) return null;
  ls.setItem(IDB_MARKER, "1");
  for (const k of moving.keys()) ls.removeItem(k);
  return cachedKV(db, map, ls);
}

function cachedKV(db: IDBDatabase, map: Map<string, string>, ls: Storage): KV {
  let pending = new Map<string, string | null>();
  let scheduled = false;
  const tabs = typeof BroadcastChannel === "function" ? new BroadcastChannel(DB) : null;
  if (tabs) {
    tabs.onmessage = (e: MessageEvent<Op[]>) => {
      for (const [k, v] of e.data) {
        if (v === null) map.delete(k);
        else map.set(k, v);
      }
    };
  }

  function failed(batch: Map<string, string | null>, err: unknown): void {
    console.warn("[storage] couldn't save to IndexedDB", err);
    for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v);
    reportSaveFailed();
  }

  function flush(): void {
    scheduled = false;
    const batch = pending;
    pending = new Map();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      for (const [k, v] of batch) {
        if (v === null) s.delete(k);
        else s.put(v, k);
      }
    } catch (err) {
      failed(batch, err);
      return;
    }
    done(tx).then(
      () => tabs?.postMessage([...batch] satisfies Op[]),
      (err: unknown) => failed(batch, err),
    );
  }

  function queue(key: string, value: string | null): void {
    pending.set(key, value);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  }

  return {
    get(key) {
      if (!LOCAL_KEYS.has(key)) return map.get(key) ?? null;
      try {
        return ls.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (LOCAL_KEYS.has(key)) return ls.setItem(key, value);
      map.set(key, String(value));
      queue(key, String(value));
    },
    remove(key) {
      if (LOCAL_KEYS.has(key)) return ls.removeItem(key);
      map.delete(key);
      queue(key, null);
    },
    keys: () => [...map.keys(), ...[...LOCAL_KEYS].filter((k) => ls.getItem(k) !== null)],
  };
}

/**
 * Make IndexedDB the app's storage when it opens within OPEN_TIMEOUT_MS and the
 * move from localStorage checks out. Otherwise defaultKV() keeps its
 * localStorage, then memory, fallback; but once the data has moved, memory only,
 * since saving to an empty localStorage would later be moved over the real data.
 * Never throws. Run before the app renders.
 */
export async function initStorage(timeoutMs = OPEN_TIMEOUT_MS): Promise<void> {
  let moved = false;
  try {
    moved = globalThis.localStorage.getItem(IDB_MARKER) === "1";
  } catch {
    // no localStorage: nothing has moved
  }
  let late = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      late = true;
      resolve(null);
    }, timeoutMs);
  });
  try {
    const kv = await Promise.race([openIdbKV(() => late), timeout]);
    if (kv) {
      setDefaultKV(kv, "indexeddb");
      return;
    }
  } catch (err) {
    console.warn("[storage] IndexedDB unavailable", err);
  } finally {
    clearTimeout(timer);
  }
  if (moved) setDefaultKV(memoryKV(), "memory");
}
