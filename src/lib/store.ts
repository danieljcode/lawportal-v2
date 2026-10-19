// One saved value with a schema version (LP-2): the base the data stores are
// built on (characters first; dockets and the J.A.P. in LP-99).
//
// A value is saved as `{"v": <version>, "data": <value>}`. Anything saved before
// a store moved onto this base is a bare value, read as version 1; nothing
// saved is version 0. On load, the store's migrations upgrade old data one step
// at a time. Reads upgrade in memory only and never write; migrate() saves the
// upgraded value and runs each step's clean-up, once, at start-up (outside render).

import { createChannel, readJson, writeJson, type KV } from "./storage";

export interface Envelope {
  v: number;
  data: unknown;
}

/** One upgrade step. */
export interface Migration {
  /** The version this step produces (steps run in order of `to`). */
  to: number;
  /** The previous version's data → this version's. `data` is undefined when nothing is saved. Reads only. */
  up(data: unknown, kv: KV): unknown;
  /** Side effects once the upgraded value is saved (removing an old key, say). Only migrate() runs it. */
  after?(kv: KV): void;
}

export interface StoreOptions<T> {
  key: string;
  /** The current schema version (≥ 1). */
  version: number;
  /** Untrusted data → a clean value. Never throws. */
  validate(data: unknown): T;
  migrations?: readonly Migration[];
  /** A value saved as nothing (the key is removed), e.g. an empty list. */
  isEmpty?(value: T): boolean;
}

export interface Store<T> {
  readonly key: string;
  /** The saved value, upgraded and validated. */
  get(): T;
  /** Save (or remove, when empty) and tell subscribers. Throws SAVE_FAILED when storage refuses. */
  set(value: T): void;
  /**
   * Save old data in the current version and run the steps' clean-ups. Returns
   * whether anything was upgraded; a no-op once done, so safe on every start.
   */
  migrate(): boolean;
  /** What's saved now and its version (0: nothing; 1: a bare value from before this base). */
  stored(): { version: number; data: unknown };
  /** Fires after set() and after a migrate() that changed anything. */
  subscribe(fn: () => void): () => void;
  /** Bumped on each change, for useSyncExternalStore snapshots. */
  version(): number;
}

export function isEnvelope(raw: unknown): raw is Envelope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const e = raw as Record<string, unknown>;
  return typeof e.v === "number" && Number.isInteger(e.v) && e.v >= 1 && "data" in e;
}

/** A stored value without its envelope (a bare, pre-store value as it is). */
export function unwrap(raw: unknown): unknown {
  return isEnvelope(raw) ? raw.data : raw;
}

export function createStore<T>(kv: KV, opts: StoreOptions<T>): Store<T> {
  const { key, version: current, validate, isEmpty } = opts;
  if (!Number.isInteger(current) || current < 1) throw new Error(`${key}: version must be 1 or more`);
  const steps = [...(opts.migrations || [])].sort((a, b) => a.to - b.to);
  const changes = createChannel();

  function stored(): { version: number; data: unknown } {
    const raw = readJson<unknown>(kv, key);
    if (raw === null) return { version: 0, data: undefined };
    if (isEnvelope(raw)) return { version: raw.v, data: raw.data };
    return { version: 1, data: raw };
  }

  /** The steps from `from` up to the current version, applied in memory. */
  function upgrade(from: number, data: unknown): { data: unknown; applied: Migration[] } {
    const applied: Migration[] = [];
    for (const step of steps) {
      if (step.to <= from || step.to > current) continue;
      data = step.up(data, kv);
      applied.push(step);
    }
    return { data, applied };
  }

  function write(value: T): void {
    if (isEmpty?.(value)) kv.remove(key);
    else writeJson(kv, key, { v: current, data: value } satisfies Envelope);
  }

  return {
    key,
    stored,
    get() {
      const s = stored();
      // Data from a newer version is read as it is: never downgraded, never rewritten here.
      const data = s.version < current ? upgrade(s.version, s.data).data : s.data;
      return validate(data);
    },
    set(value) {
      write(value);
      changes.emit();
    },
    migrate() {
      const s = stored();
      if (s.version >= current) return false;
      const { data, applied } = upgrade(s.version, s.data);
      // Nothing saved and nothing brought in: leave the key absent.
      if (data !== undefined) write(validate(data));
      for (const step of applied) step.after?.(kv);
      if (data !== undefined) changes.emit();
      return data !== undefined;
    },
    subscribe: changes.subscribe,
    version: changes.version,
  };
}
