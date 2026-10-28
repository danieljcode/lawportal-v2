// Key-value storage for the client stores (design D5).
//
// Everything goes through a tiny KV interface so the stores can be tested with
// memoryKV(). The app uses localStorage, or an in-memory map when the browser
// blocks storage (private modes, disabled site data).

export interface KV {
  get(key: string): string | null;
  /** Throws when the browser refuses the write (quota, blocked). */
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Every key stored (the full backup, LP-1). Optional: the stores never need it. */
  keys?(): string[];
}

export type Backend = "local" | "memory";

export const SAVE_FAILED = "Couldn't save in this browser (storage is full or blocked).";

const PROBE = "lawapp_probe";

/** localStorage behind the KV interface. Throws when storage is unavailable. */
export function localKV(): KV {
  const ls = globalThis.localStorage;
  if (!ls) throw new Error("localStorage is not available.");
  ls.setItem(PROBE, "1");
  ls.removeItem(PROBE);
  return {
    get(key) {
      try {
        return ls.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      ls.setItem(key, value);
    },
    remove(key) {
      try {
        ls.removeItem(key);
      } catch {
        // ignore: nothing to remove
      }
    },
    keys() {
      const out: string[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

/** An in-memory KV (tests, and the fallback when localStorage is blocked). */
export function memoryKV(initial?: Record<string, string>): KV {
  const map = new Map<string, string>(Object.entries(initial || {}));
  return {
    get: (key) => (map.has(key) ? (map.get(key) as string) : null),
    set: (key, value) => {
      map.set(key, String(value));
    },
    remove: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

let defaultKv: KV | null = null;
let defaultBackend: Backend = "local";

/** The shared KV for the app: localStorage, or memory after a failed probe. Client only. */
export function defaultKV(): KV {
  if (!defaultKv) {
    try {
      defaultKv = localKV();
      defaultBackend = "local";
    } catch {
      defaultKv = memoryKV();
      defaultBackend = "memory";
    }
  }
  return defaultKv;
}

/** Which storage the app is using (picks it on first call). */
export function backend(): Backend {
  defaultKV();
  return defaultBackend;
}

/**
 * Parse a JSON value. A corrupt value reads as null and is set aside (see
 * setAside) before it is removed, so one bad write can't wipe saved work.
 */
export function readJson<T = unknown>(kv: KV, key: string): T | null {
  const raw = kv.get(key);
  if (raw === null || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[storage] setting aside unreadable value for ${key}`);
    if (setAside(kv, key, raw)) kv.remove(key);
    return null;
  }
}

/* ---------- damaged values ---------- */

/** Backups are `lawapp_corrupt_<key>_<ms>`; the last 3 per key are kept. */
export const CORRUPT_PREFIX = "lawapp_corrupt_";
/** JSON list of the backup keys (KV can't list keys). */
export const CORRUPT_INDEX_KEY = "lawapp_corrupt_index";
export const KEEP_CORRUPT = 3;

export interface SetAsideValue {
  /** The key the value was read from. */
  key: string;
  /** ISO time it was set aside. */
  at: string;
  /** The value exactly as stored. */
  raw: string;
}

const setAsideChanges = createChannel();
/** Values that couldn't be backed up in storage (full or blocked): kept for this page only. */
let unsaved: SetAsideValue[] = [];

function corruptIndex(kv: KV): string[] {
  try {
    const list: unknown = JSON.parse(kv.get(CORRUPT_INDEX_KEY) || "[]");
    return Array.isArray(list)
      ? list.filter((k): k is string => typeof k === "string" && k.startsWith(CORRUPT_PREFIX))
      : [];
  } catch {
    return [];
  }
}

/**
 * Copy an unreadable value to a backup key before it's dropped, keeping the
 * last 3 per key, and raise the "set aside" notice. Returns false when the
 * backup couldn't be written: the caller should then leave the value alone.
 */
export function setAside(kv: KV, key: string, raw: string): boolean {
  const now = Date.now();
  let saved = false;
  try {
    const backup = CORRUPT_PREFIX + key + "_" + now;
    kv.set(backup, raw);
    const index = [...corruptIndex(kv).filter((k) => k !== backup), backup];
    const mine = index.filter((k) => k.startsWith(CORRUPT_PREFIX + key + "_"));
    const drop = new Set(mine.slice(0, -KEEP_CORRUPT));
    for (const k of drop) kv.remove(k);
    kv.set(CORRUPT_INDEX_KEY, JSON.stringify(index.filter((k) => !drop.has(k))));
    saved = true;
  } catch (err) {
    console.warn(`[storage] couldn't back up ${key}; leaving it in place`, err);
    if (!unsaved.some((v) => v.key === key && v.raw === raw)) {
      unsaved.push({ key, at: new Date(now).toISOString(), raw });
    }
  }
  setAsideChanges.emit();
  return saved;
}

/** Every value set aside: the stored backups (oldest first), then any this page couldn't store. */
export function listSetAside(kv: KV): SetAsideValue[] {
  const out: SetAsideValue[] = [];
  for (const k of corruptIndex(kv)) {
    const raw = kv.get(k);
    if (raw === null) continue;
    const cut = k.lastIndexOf("_");
    const ms = Number(k.slice(cut + 1));
    out.push({
      key: k.slice(CORRUPT_PREFIX.length, cut),
      at: Number.isFinite(ms) ? new Date(ms).toISOString() : "",
      raw,
    });
  }
  return [...out, ...unsaved];
}

/** Fires when a value is set aside; the version counts them since the page loaded. */
export const subscribeSetAside = setAsideChanges.subscribe;
export const setAsideVersion = setAsideChanges.version;

/** Test-only: forget values held in memory. */
export function __resetSetAsideForTests(): void {
  unsaved = [];
}

/** Store a JSON value. Throws Error(SAVE_FAILED) when the browser refuses the write. */
export function writeJson(kv: KV, key: string, value: unknown): void {
  try {
    kv.set(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] couldn't write ${key}`, err);
    throw new Error(SAVE_FAILED);
  }
}

/** A change channel: listeners plus a version counter for useSyncExternalStore. */
export interface Channel {
  subscribe(fn: () => void): () => void;
  emit(): void;
  version(): number;
}

export function createChannel(): Channel {
  const listeners = new Set<() => void>();
  let v = 0;
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit() {
      v++;
      for (const fn of [...listeners]) fn();
    },
    version: () => v,
  };
}

/*
 * Docket and J.A.P. edits call touchCharacter so their character's updatedAt
 * moves too: sync merges one character at a time, with its dockets and J.A.P.
 * (the app's character store listens; the stores don't import each other).
 */
const touchListeners = new Set<(charId: string) => void>();

export function onCharacterTouched(fn: (charId: string) => void): () => void {
  touchListeners.add(fn);
  return () => {
    touchListeners.delete(fn);
  };
}

export function touchCharacter(charId: string): void {
  for (const fn of [...touchListeners]) fn(charId);
}

/** Ids of characters (and the keys derived from them) are always this shape. */
export const ID_RE = /^[a-z0-9]{4,32}$/;

export function isId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/**
 * A fresh id: base-36 time plus 12 random base-36 chars (LP-157). Many ids are made in one
 * millisecond (cleaning a synced or imported list), and the stores drop a repeated id.
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Date.now().toString(36) + Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/** ISO timestamp as produced by Date#toISOString. */
export const ISO_TIME_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
/** ISO calendar date. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Store a plain string with the same error contract as writeJson. */
export function writeString(kv: KV, key: string, value: string): void {
  try {
    kv.set(key, value);
  } catch (err) {
    console.warn(`[storage] couldn't write ${key}`, err);
    throw new Error(SAVE_FAILED);
  }
}
