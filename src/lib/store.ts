// Saved values with a schema version (LP-2): the base the data stores are built
// on. createStore is one value under one key (characters); createKeyedStore is
// one value per id under a key prefix (dockets and the J.A.P., LP-99). Both
// share the per-key code below.
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

/** What every store is told: everything but where it's saved. */
export interface SchemaOptions<T> {
  /** The current schema version (≥ 1). */
  version: number;
  /** Untrusted data → a clean value. Never throws. */
  validate(data: unknown): T;
  migrations?: readonly Migration[];
  /** A value saved as nothing (the key is removed), e.g. an empty list. */
  isEmpty?(value: T): boolean;
}

export interface StoreOptions<T> extends SchemaOptions<T> {
  key: string;
}

export interface KeyedStoreOptions<T> extends SchemaOptions<T> {
  /** Each id's value is saved under prefix + id. */
  prefix: string;
  /** The ids that can be saved; anything else is never read or written. */
  isId(id: string): boolean;
}

export interface Stored {
  version: number;
  data: unknown;
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
  stored(): Stored;
  /** Fires after set() and after a migrate() that changed anything. */
  subscribe(fn: () => void): () => void;
  /** Bumped on each change, for useSyncExternalStore snapshots. */
  version(): number;
}

export interface KeyedStore<T> {
  readonly prefix: string;
  /** An id's saved value, upgraded and validated (validate(undefined) for an id that can't be saved). */
  get(id: string): T;
  /** Save (or remove, when empty) and tell subscribers; nothing for an id that can't be saved. */
  set(id: string, value: T): void;
  /** migrate() for every id with something saved; one change event if any were upgraded. */
  migrate(): boolean;
  stored(id: string): Stored;
  /** The ids with something saved (needs a KV that can list keys). */
  ids(): string[];
  subscribe(fn: () => void): () => void;
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

/** One saved key's reads, writes and upgrade, without change events. */
interface Slot<T> {
  stored(): Stored;
  get(): T;
  write(value: T): void;
  /** Whether anything was upgraded and saved. */
  migrate(): boolean;
}

function checkVersion(name: string, version: number): void {
  if (!Number.isInteger(version) || version < 1) throw new Error(`${name}: version must be 1 or more`);
}

/** The schema shared by every key of one store: its sorted steps and the per-key code. */
function schema<T>(kv: KV, opts: SchemaOptions<T>): (key: string) => Slot<T> {
  const { version: current, validate, isEmpty } = opts;
  const steps = [...(opts.migrations || [])].sort((a, b) => a.to - b.to);

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

  return (key) => {
    function stored(): Stored {
      const raw = readJson<unknown>(kv, key);
      if (raw === null) return { version: 0, data: undefined };
      if (isEnvelope(raw)) return { version: raw.v, data: raw.data };
      return { version: 1, data: raw };
    }

    function write(value: T): void {
      if (isEmpty?.(value)) kv.remove(key);
      else writeJson(kv, key, { v: current, data: value } satisfies Envelope);
    }

    return {
      stored,
      write,
      get() {
        const s = stored();
        // Data from a newer version is read as it is: never downgraded, never rewritten here.
        return validate(s.version < current ? upgrade(s.version, s.data).data : s.data);
      },
      migrate() {
        const s = stored();
        if (s.version >= current) return false;
        const { data, applied } = upgrade(s.version, s.data);
        // Nothing saved and nothing brought in: leave the key absent.
        if (data !== undefined) write(validate(data));
        for (const step of applied) step.after?.(kv);
        return data !== undefined;
      },
    };
  };
}

export function createStore<T>(kv: KV, opts: StoreOptions<T>): Store<T> {
  checkVersion(opts.key, opts.version);
  const slot = schema(kv, opts)(opts.key);
  const changes = createChannel();
  return {
    key: opts.key,
    stored: slot.stored,
    get: slot.get,
    set(value) {
      slot.write(value);
      changes.emit();
    },
    migrate() {
      const changed = slot.migrate();
      if (changed) changes.emit();
      return changed;
    },
    subscribe: changes.subscribe,
    version: changes.version,
  };
}

export function createKeyedStore<T>(kv: KV, opts: KeyedStoreOptions<T>): KeyedStore<T> {
  const { prefix, isId, validate } = opts;
  checkVersion(prefix + "*", opts.version);
  const slotFor = schema(kv, opts);
  const changes = createChannel();

  function ids(): string[] {
    if (!kv.keys) return [];
    return kv
      .keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .filter(isId);
  }

  return {
    prefix,
    ids,
    stored: (id) => (isId(id) ? slotFor(prefix + id).stored() : { version: 0, data: undefined }),
    get: (id) => (isId(id) ? slotFor(prefix + id).get() : validate(undefined)),
    set(id, value) {
      if (!isId(id)) return;
      slotFor(prefix + id).write(value);
      changes.emit();
    },
    migrate() {
      let changed = false;
      for (const id of ids()) if (slotFor(prefix + id).migrate()) changed = true;
      if (changed) changes.emit();
      return changed;
    },
    subscribe: changes.subscribe,
    version: changes.version,
  };
}
