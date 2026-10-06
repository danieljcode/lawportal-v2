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

/** Parse a JSON value; a corrupt value is removed (with a warning) and read as null. */
export function readJson<T = unknown>(kv: KV, key: string): T | null {
  const raw = kv.get(key);
  if (raw === null || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[storage] removing corrupt value for ${key}`);
    kv.remove(key);
    return null;
  }
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

/** Ids of characters (and the keys derived from them) are always this shape. */
export const ID_RE = /^[a-z0-9]{4,32}$/;

export function isId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/** A fresh id: base-36 time plus 4 random base-36 chars. */
export function newId(): string {
  let rand = "";
  while (rand.length < 4) rand += Math.random().toString(36).slice(2);
  return Date.now().toString(36) + rand.slice(0, 4);
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
