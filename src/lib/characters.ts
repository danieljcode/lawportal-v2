// Saved characters (INV §e.1, design D5/D6).
//
// One JSON array under lawapp_chars, in display order, plus the active id under
// lawapp_active_char. Behaviour follows the reference js_characters.js, without
// its cookie limits: there is a hard cap of 200 characters instead. This store
// only knows characters: work spanning dockets and J.A.P. is in services/characters.ts.
//
// The list is saved through the shared store base (store.ts, LP-2) as schema
// version 2: {"v": 2, "data": [...]}. Version 1 is the bare array saved before
// LP-2, and the step to 1 brings in the old lawapp.characters.v1 list.

import type { Character } from "./types";
import {
  createChannel,
  defaultKV,
  isId,
  ISO_TIME_RE,
  newId,
  onCharacterTouched,
  setAside,
  writeJson,
  writeString,
  type KV,
} from "./storage";
import { createStore, type Migration } from "./store";

export const CHARS_KEY = "lawapp_chars";
export const ACTIVE_KEY = "lawapp_active_char";
export const LEGACY_KEY = "lawapp.characters.v1";
/** The default server saved before LP-70, when there was a server choice; deleted by migrateServerField. */
export const LEGACY_SERVER_KEY = "lawapp_server";
export const MAX_CHARACTERS = 200;
/** The saved list's schema version (LP-2). */
export const CHARS_VERSION = 2;
const MAX_TEXT = 4000;

export const TOO_MANY = "You can keep up to 200 characters.";
export const NEEDS_NAME = "A character needs a name.";

export type CharacterKey = Exclude<keyof Character, "id">;

export interface CharacterField {
  key: CharacterKey;
  label: string;
  required?: boolean;
  hint?: string;
  multiline?: boolean;
  checkbox?: boolean;
}

/** The reference's 12 character fields, in its order. */
export const FIELDS: readonly CharacterField[] = [
  { key: "name", label: "Full name", required: true },
  { key: "title", label: "Title / position", hint: "e.g. Deputy District Attorney, Attorney at Law, Judge" },
  { key: "dob", label: "Date of birth" },
  { key: "gender", label: "Gender" },
  { key: "phone", label: "Phone number" },
  { key: "address", label: "Address" },
  { key: "occupation", label: "Occupation" },
  { key: "bar", label: "Bar / badge number" },
  { key: "email", label: "Email" },
  { key: "signature", label: "Signature", hint: "Text, or a link to a signature image" },
  { key: "notes", label: "Notes", multiline: true },
  {
    key: "docket",
    label: "Keeps a docket (judge or lawyer)",
    checkbox: true,
    hint: "Turns on Dockets for this character: a list of their cases they can load into any form.",
  },
];

/** Titles that get a docket by default (until the box is ticked or unticked by hand). */
export const DOCKET_TITLE =
  /\b(judge|justice|commissioner|magistrate|attorney|lawyer|counsel|counselor|prosecutor|defender|solicitor|barrister|esq)\b/i;

export function titleKeepsDocket(title: string | undefined): boolean {
  return DOCKET_TITLE.test(title || "");
}

/** An explicit `docket` wins; then the legacy judge-only box; then the title. */
export function hasDocket(c: (Partial<Character> & { judge?: unknown }) | null | undefined): boolean {
  if (!c) return false;
  if (c.docket !== undefined) return !!c.docket;
  if (c.judge === true) return true;
  return DOCKET_TITLE.test(c.title || "");
}

/** A valid id is kept; anything else (e.g. from an imported file) is replaced. */
export function safeId(id: unknown): string {
  return isId(id) ? id : newId();
}

/** Normalise an untrusted character: trimmed strings (≤ 4000), empties dropped, docket as a boolean. */
export function clean(input: unknown): Character {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string | boolean> = { id: safeId(c.id) };
  for (const f of FIELDS) {
    const v = c[f.key];
    if (f.checkbox) {
      if (v !== undefined) out[f.key] = !!v;
      continue;
    }
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[f.key] = s.slice(0, MAX_TEXT);
  }
  // Carry over the old judge-only box.
  if (out.docket === undefined && c.judge === true) out.docket = true;
  if (typeof c.updatedAt === "string" && ISO_TIME_RE.test(c.updatedAt)) out.updatedAt = c.updatedAt;
  return out as unknown as Character;
}

export interface ExportDoc {
  app: "jsa-form-generator";
  version: 1;
  characters: Character[];
}

export interface ImportResult {
  count: number;
  /** Each stored entry with its raw source object; `character.id` may differ from `source.id`. */
  saved: Array<{ source: Record<string, unknown>; character: Character }>;
}

export interface CharacterStore {
  list(): Character[];
  get(id: string): Character | null;
  /**
   * Stamps updatedAt with now unless `keepStamp` (sync storing another device's copy).
   * Throws "A character needs a name.", "You can keep up to 200 characters." or the storage error.
   */
  save(c: Partial<Character> | Record<string, unknown>, opts?: { keepStamp?: boolean }): Character;
  /** Stamp updatedAt with now (a docket or J.A.P. change); nothing for an unknown id. */
  touch(id: string): void;
  /** Removes only the character (and clears the active id if it was active); deleteCharacter in services/characters.ts also removes its docket and J.A.P. */
  remove(id: string): void;
  duplicate(id: string): Character | null;
  move(id: string, delta: number): void;
  activeId(): string | null;
  /** The active character; a stale active id is cleared and reads as none. */
  active(): Character | null;
  setActive(id: string | null): void;
  exportJson(): ExportDoc;
  importJson(text: string): ImportResult;
  /**
   * Upgrade the saved list to the current schema version (LP-2): an old bare
   * list is wrapped, and with nothing saved the old `lawapp.characters.v1` list
   * is brought in. Runs once at start-up; returns whether anything changed.
   */
  migrate(): boolean;
  /** migrate(), for nothing saved yet: the number of characters brought in from the old list. */
  migrateLegacy(): number;
  /**
   * LP-71: drop the `server` field saved on characters before LP-70 and the saved
   * default server. Nothing else is touched (not even updatedAt, so sync doesn't
   * see an edit). Returns how many characters had the field.
   */
  migrateServerField(): number;
  /** Fires after data mutations (save, remove, duplicate, move, importJson, migrate). */
  subscribe(fn: () => void): () => void;
  /** Fires when the active character changes (UI only; not synced). */
  subscribeActive(fn: () => void): () => void;
  version(): number;
  activeVersion(): number;
}

/** The saved list, cleaned: entries without a valid id or a name, and repeated ids, are dropped. */
function validList(raw: unknown): Character[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Character[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = (item as Record<string, unknown>).id;
    if (!isId(id) || seen.has(id)) continue;
    const c = clean(item);
    if (!c.name) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

function freshId(taken: Set<string>): string {
  let id = newId();
  while (taken.has(id)) id = newId();
  return id;
}

/** The old lawapp.characters.v1 list (fullName, barNumber, firm…) as characters; undefined if absent or unreadable. */
function legacyList(kv: KV): Character[] | undefined {
  const raw = kv.get(LEGACY_KEY);
  if (raw === null) return undefined;
  let old: unknown;
  try {
    old = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const arr = Array.isArray(old)
    ? old
    : old && typeof old === "object"
      ? (old as { characters?: unknown }).characters
      : [];
  const list: Character[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(arr) ? arr : []) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const firm = typeof o.firm === "string" ? o.firm.trim() : "";
    const notes = typeof o.notes === "string" ? o.notes.trim() : "";
    const id = isId(o.id) && !ids.has(o.id) ? o.id : freshId(ids);
    const mapped = clean({
      id,
      name: o.fullName ?? o.name,
      title: o.title,
      bar: o.barNumber ?? o.bar,
      address: o.address,
      phone: o.phone,
      email: o.email,
      notes: firm ? "Firm: " + firm + (notes ? "\n" + notes : "") : notes,
    });
    if (!mapped.name || list.length >= MAX_CHARACTERS) continue;
    ids.add(mapped.id);
    list.push(mapped);
  }
  return list;
}

/** The characters list's upgrade steps (LP-2). */
export const CHARACTER_MIGRATIONS: readonly Migration[] = [
  {
    // Nothing saved yet: bring in the old lawapp.characters.v1 list, if there is one.
    to: 1,
    up: (data, kv) => (data !== undefined ? data : legacyList(kv)),
    after(kv) {
      const raw = kv.get(LEGACY_KEY);
      if (raw === null) return;
      try {
        JSON.parse(raw);
        kv.remove(LEGACY_KEY);
      } catch {
        console.warn("[characters] setting aside unreadable " + LEGACY_KEY);
        if (setAside(kv, LEGACY_KEY, raw)) kv.remove(LEGACY_KEY);
      }
    },
  },
  // Version 1 was the bare array; version 2 is the same list in the store envelope.
  { to: 2, up: (data) => data },
];

export function createCharacterStore(kv: KV): CharacterStore {
  const store = createStore<Character[]>(kv, {
    key: CHARS_KEY,
    version: CHARS_VERSION,
    validate: validList,
    migrations: CHARACTER_MIGRATIONS,
    isEmpty: (list) => list.length === 0,
  });
  const activeChanges = createChannel();
  const read = store.get;
  const write = store.set;

  /** Insert or replace by id inside `list` (no write). */
  function put(list: Character[], input: unknown, stamp = true): Character {
    const data = clean(input);
    if (!data.name) throw new Error(NEEDS_NAME);
    if (stamp) data.updatedAt = new Date().toISOString();
    const i = list.findIndex((x) => x.id === data.id);
    if (i >= 0) list[i] = data;
    else {
      if (list.length >= MAX_CHARACTERS) throw new Error(TOO_MANY);
      list.push(data);
    }
    return data;
  }

  function activeId(): string | null {
    const id = kv.get(ACTIVE_KEY);
    return isId(id) ? id : null;
  }

  function get(id: string): Character | null {
    if (!isId(id)) return null;
    return read().find((c) => c.id === id) || null;
  }

  function setActiveQuiet(id: string | null): void {
    if (id && isId(id)) writeString(kv, ACTIVE_KEY, id);
    else kv.remove(ACTIVE_KEY);
  }

  return {
    list: read,
    get,
    save(c, opts) {
      const list = read();
      const saved = put(list, c, !opts?.keepStamp);
      write(list);
      return saved;
    },
    touch(id) {
      const list = read();
      const c = list.find((x) => x.id === id);
      if (!c) return;
      c.updatedAt = new Date().toISOString();
      write(list);
    },
    remove(id) {
      const list = read();
      write(list.filter((c) => c.id !== id));
      const wasActive = activeId() === id;
      if (wasActive) setActiveQuiet(null);
      if (wasActive) activeChanges.emit();
    },
    duplicate(id) {
      const list = read();
      const c = list.find((x) => x.id === id);
      if (!c) return null;
      const copy = put(list, {
        ...c,
        id: freshId(new Set(list.map((x) => x.id))),
        name: c.name + " (copy)",
      });
      write(list);
      return copy;
    },
    move(id, delta) {
      const list = read();
      const i = list.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      list.splice(j, 0, list.splice(i, 1)[0]);
      write(list);
    },
    activeId,
    active() {
      const id = activeId();
      if (!id) return null;
      const c = get(id);
      if (!c) kv.remove(ACTIVE_KEY);
      return c;
    },
    setActive(id) {
      setActiveQuiet(id);
      activeChanges.emit();
    },
    exportJson() {
      return { app: "jsa-form-generator", version: 1, characters: read() };
    },
    importJson(text) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      const arr = Array.isArray(data)
        ? data
        : data && typeof data === "object"
          ? (data as { characters?: unknown }).characters
          : undefined;
      if (!Array.isArray(arr)) throw new Error("No characters found in that file.");

      const list = read();
      const ids = new Set(list.map((c) => c.id));
      // Pick each entry's stored id first, so the cap is checked before anything is saved.
      const incoming: Array<{ source: Record<string, unknown>; id: string }> = [];
      for (const raw of arr) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const source = raw as Record<string, unknown>;
        if (!clean(source).name) continue;
        const id = isId(source.id) ? source.id : freshId(ids);
        ids.add(id);
        incoming.push({ source, id });
      }
      if (ids.size > MAX_CHARACTERS) throw new Error(TOO_MANY);

      const saved = incoming.map(({ source, id }) => ({ source, character: put(list, { ...source, id }) }));
      if (saved.length) write(list);
      return { count: saved.length, saved };
    },
    migrate: store.migrate,
    migrateLegacy() {
      if (store.stored().version !== 0) return 0;
      store.migrate();
      return read().length;
    },
    migrateServerField() {
      kv.remove(LEGACY_SERVER_KEY);
      const { version, data: raw } = store.stored();
      if (!Array.isArray(raw)) return 0;
      let count = 0;
      const next = raw.map((item) => {
        if (!item || typeof item !== "object" || !("server" in item)) return item;
        count++;
        const { server: _dropped, ...rest } = item as Record<string, unknown>;
        return rest;
      });
      // Saved back in the format it was found in: migrate() wraps a bare list.
      if (count) writeJson(kv, CHARS_KEY, version >= 2 ? { v: version, data: next } : next);
      return count;
    },
    subscribe: store.subscribe,
    subscribeActive: activeChanges.subscribe,
    version: store.version,
    activeVersion: activeChanges.version,
  };
}

let instance: CharacterStore | null = null;

/** The app's character store (created on first use; client only). */
export function characterStore(): CharacterStore {
  if (!instance) {
    const store = createCharacterStore(defaultKV());
    onCharacterTouched((id) => store.touch(id));
    instance = store;
  }
  return instance;
}
