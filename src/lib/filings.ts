// Filing history (LP-15): a copy of every filing copied for the forum, as
// BBCode or for Discord, or downloaded as .docx, so it can be looked up, reused
// as a new draft, or copied again. One list under lawapp_filings, newest last,
// on the store base. It syncs and is in the full backup.
//
// A filing keeps the form's values, not its HTML: "Copy again" renders them
// with today's template, and the list stays small enough to sync. The newest
// MAX_FILINGS are kept; if storage is full, the oldest go first.

import type { FormState } from "./formState";
import { toFormState } from "./formState";
import { defaultKV, isId, ISO_TIME_RE, newId, type KV } from "./storage";
import { createStore } from "./store";

export const FILINGS_KEY = "lawapp_filings";
export const FILINGS_VERSION = 1;
export const MAX_FILINGS = 150;

export const VIAS = ["forum", "bbcode", "discord", "docx"] as const;
export type FilingVia = (typeof VIAS)[number];

export const VIA_LABELS: Readonly<Record<FilingVia, string>> = {
  forum: "Copied for forum",
  bbcode: "Copied as BBCode",
  discord: "Copied for Discord",
  docx: "Downloaded as .docx",
};

export interface Filing {
  id: string;
  /** Real (not in-game) time, ISO. */
  at: string;
  formId: string;
  formTitle: string;
  /** The character filing it, if one was active. */
  charId: string | null;
  charName?: string;
  /** The form's case number, and the firm case it matched then (LP-4), if any. */
  caseNumber?: string;
  caseId?: string | null;
  via: FilingVia;
  state: FormState;
}

const FORM_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const text = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Normalise an untrusted filing (sync, backup); null when it isn't one. */
export function cleanFiling(input: unknown): Filing | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const state = toFormState(o.state);
  if (typeof o.formId !== "string" || !FORM_ID.test(o.formId) || !state) return null;
  if (typeof o.at !== "string" || !ISO_TIME_RE.test(o.at)) return null;
  return {
    id: isId(o.id) ? o.id : newId(),
    at: o.at,
    formId: o.formId,
    formTitle: text(o.formTitle) || o.formId,
    charId: isId(o.charId) ? o.charId : null,
    ...(text(o.charName) ? { charName: text(o.charName) } : {}),
    ...(text(o.caseNumber, 60) ? { caseNumber: text(o.caseNumber, 60) } : {}),
    caseId: isId(o.caseId) ? o.caseId : null,
    via: (VIAS as readonly string[]).includes(o.via as string) ? (o.via as FilingVia) : "forum",
    state,
  };
}

function validList(raw: unknown): Filing[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Filing[] = [];
  for (const item of raw) {
    const f = cleanFiling(item);
    if (!f || seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export interface FilingFilter {
  /** Matches the form title, case number or character name, ignoring case. */
  q?: string;
  charId?: string;
  /** Exact case number (any capitals). */
  caseNumber?: string;
}

/** Filings matching a search and filters, newest first. */
export function filterFilings(list: readonly Filing[], f: FilingFilter): Filing[] {
  const q = (f.q || "").trim().toLowerCase();
  const num = (f.caseNumber || "").trim().toUpperCase();
  return list
    .filter((x) => {
      if (q && ![x.formTitle, x.caseNumber, x.charName].some((s) => (s || "").toLowerCase().includes(q))) return false;
      if (f.charId && x.charId !== f.charId) return false;
      return !num || (x.caseNumber || "").toUpperCase() === num;
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** A case's filings (LP-4 cases): linked to it, or carrying its case number. Newest first. */
export function filingsForCase(list: readonly Filing[], c: { id: string; caseNumber: string }): Filing[] {
  const num = c.caseNumber.trim().toUpperCase();
  return filterFilings(
    list.filter((f) => f.caseId === c.id || (!!f.caseNumber && f.caseNumber.toUpperCase() === num)),
    {},
  );
}

export type NewFiling = Omit<Filing, "id" | "at"> & { at?: string };

export interface FilingStore {
  /** Every filing, newest first. */
  list(): Filing[];
  get(id: string): Filing | null;
  /**
   * Keep a filing. Copying the same form with the same values and character
   * again (say Copy for forum, then Download .docx) refreshes the newest entry
   * instead of adding another. Returns the entry, or null when storage refused.
   */
  add(input: NewFiling): Filing | null;
  remove(id: string): void;
  /** Replace every filing (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createFilingStore(kv: KV): FilingStore {
  const store = createStore<Filing[]>(kv, {
    key: FILINGS_KEY,
    version: FILINGS_VERSION,
    validate: validList,
    isEmpty: (list) => list.length === 0,
  });

  /** Save, dropping the oldest first while storage is full. */
  function save(list: Filing[]): boolean {
    let next = list.slice(-MAX_FILINGS);
    for (;;) {
      try {
        store.set(next);
        return true;
      } catch {
        if (next.length <= 1) return false;
        next = next.slice(Math.max(1, Math.floor(next.length / 4)));
      }
    }
  }

  return {
    list: () => store.get().reverse(),
    get: (id) => store.get().find((f) => f.id === id) || null,
    add(input) {
      const f = cleanFiling({ ...input, id: newId(), at: input.at || new Date().toISOString() });
      if (!f) return null;
      const list = store.get();
      const newest = list[list.length - 1];
      const same =
        newest &&
        newest.formId === f.formId &&
        newest.charId === f.charId &&
        JSON.stringify(newest.state.values) === JSON.stringify(f.state.values);
      const entry = same ? { ...f, id: newest.id } : f;
      return save(same ? [...list.slice(0, -1), entry] : [...list, entry]) ? entry : null;
    },
    remove(id) {
      store.set(store.get().filter((f) => f.id !== id));
    },
    replaceAll(items) {
      save(validList(items));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: FilingStore | null = null;

/** The app's filing history (created on first use; client only). */
export function filingStore(): FilingStore {
  if (!instance) instance = createFilingStore(defaultKV());
  return instance;
}
