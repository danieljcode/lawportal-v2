// Dockets: the cases a judge or lawyer character is handling (INV §e.2).
// One list per character under lawapp_dockets_<charId>; the key is removed
// when the list is empty. Behaviour follows the reference js_dockets.js.
// Saved through the keyed store base (store.ts, LP-99) as schema version 2:
// {"v": 2, "data": [...]}. Version 1 is the bare list saved before LP-99.

import { DIVISION_COURTS } from "./courts";
import type { Docket, DocketStatus } from "./types";
import { defaultKV, isId, ISO_DATE_RE, ISO_TIME_RE, newId, touchCharacter, type KV } from "./storage";
import { createKeyedStore, type Migration } from "./store";

export const DOCKETS_PREFIX = "lawapp_dockets_";
/** The saved lists' schema version (LP-99). */
export const DOCKETS_VERSION = 2;

/** Version 1 was the bare list; version 2 is the same list in the store envelope. */
export const DOCKET_MIGRATIONS: readonly Migration[] = [{ to: 2, up: (data) => data }];

export const STATUSES: readonly DocketStatus[] = ["Open", "Awaiting arguments", "Awaiting judgement", "Closed"];

export interface DocketField {
  key: Exclude<keyof Docket, "id" | "updated">;
  label: string;
  required?: boolean;
  type?: "date" | "url";
  options?: readonly string[];
  hint?: string;
  multiline?: boolean;
}

export const FIELDS: readonly DocketField[] = [
  { key: "caseNumber", label: "Case number", required: true },
  { key: "plaintiff", label: "Plaintiff / petitioner" },
  { key: "defendant", label: "Defendant / respondent" },
  { key: "court", label: "Court / division" },
  { key: "filed", label: "Filed on", type: "date" },
  { key: "status", label: "Status", options: STATUSES },
  { key: "nextEvent", label: "Next event", hint: "e.g. Openings due, Judgement" },
  { key: "nextDate", label: "Next date", type: "date" },
  { key: "link", label: "Forum thread", type: "url" },
  { key: "notes", label: "Notes", multiline: true },
];

/** Litigation codes inside a case number (90SCCR00147 → CR). */
export const DIVISION_CODES: Readonly<Record<string, string>> = {
  CR: "CRIMINAL DIVISION",
  CC: "CIVIL DIVISION",
  TC: "TRAFFIC DIVISION",
  SM: "SMALL CLAIMS DIVISION",
};

/**
 * A case's division: from the code in its number, otherwise from the court text
 * saved on the docket, either a FreestyleRP court name ("San Andreas Criminal
 * Court") or one saved before LP-69 ("…- Criminal Division").
 */
export function divisionFor(d: { caseNumber?: string; court?: string }): string | undefined {
  const m = /^\d{2}[A-Z]{2}(CR|CC|TC|SM)/i.exec(d.caseNumber || "");
  if (m) return DIVISION_CODES[m[1].toUpperCase()];
  const court = (d.court || "").toUpperCase();
  return Object.values(DIVISION_CODES).find(
    (name) => court.includes(name) || court === (DIVISION_COURTS[name] || "").toUpperCase(),
  );
}

const MAX_TEXT = 4000;

/** Normalise an untrusted docket entry (imports and sync are never trusted). */
export function clean(input: unknown): Docket {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = { id: isId(d.id) ? d.id : newId() };
  for (const f of FIELDS) {
    const v = d[f.key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[f.key] = s.slice(0, MAX_TEXT);
  }
  // Only real web links: an imported file could otherwise plant a javascript: link.
  if (out.link && !/^https?:\/\//i.test(out.link)) delete out.link;
  if (!(STATUSES as readonly string[]).includes(out.status)) out.status = STATUSES[0];
  if (out.nextDate && !ISO_DATE_RE.test(out.nextDate)) delete out.nextDate;
  if (out.filed && !ISO_DATE_RE.test(out.filed)) delete out.filed;
  out.updated = typeof d.updated === "string" && ISO_TIME_RE.test(d.updated) ? d.updated : new Date().toISOString();
  return out as unknown as Docket;
}

/** Open cases first, then by next date (soonest first, none last), then most recently updated. */
function compare(a: Docket, b: Docket): number {
  const ca = a.status === "Closed";
  const cb = b.status === "Closed";
  if (ca !== cb) return ca ? 1 : -1;
  const da = a.nextDate || "9";
  const db = b.nextDate || "9";
  if (da !== db) return da < db ? -1 : 1;
  return a.updated < b.updated ? 1 : -1;
}

export interface DocketStore {
  list(charId: string): Docket[];
  get(charId: string, id: string): Docket | null;
  findByCase(charId: string, caseNumber: string): Docket | null;
  /** Throws "A docket needs a case number." / "<n> is already on this docket."; null for an invalid charId. */
  save(charId: string, d: Partial<Docket> | Record<string, unknown>): Docket | null;
  /** Insert or update by case number, keeping fields the patch doesn't mention. */
  upsert(charId: string, patch: Partial<Docket>): Docket | null;
  remove(charId: string, id: string): void;
  removeAll(charId: string): void;
  /** Replace a character's whole docket (import and sync). */
  replace(charId: string, items: unknown): void;
  /** Upgrade every saved docket to the current schema version (LP-99); runs once at start-up. */
  migrate(): boolean;
  /** Fires after data mutations. */
  subscribe(fn: () => void): () => void;
  version(): number;
}

/** A saved list: entries without a case number are dropped. */
function validList(raw: unknown): Docket[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is Docket => !!d && typeof d === "object" && typeof (d as Docket).caseNumber === "string");
}

export function createDocketStore(kv: KV): DocketStore {
  const store = createKeyedStore<Docket[]>(kv, {
    prefix: DOCKETS_PREFIX,
    isId,
    version: DOCKETS_VERSION,
    validate: validList,
    migrations: DOCKET_MIGRATIONS,
    isEmpty: (list) => list.length === 0,
  });
  const read = store.get;
  /** Save (or remove, when empty) and tell subscribers. */
  const write = store.set;

  function findByCase(charId: string, caseNumber: string): Docket | null {
    if (!isId(charId)) return null;
    const wanted = String(caseNumber || "")
      .trim()
      .toUpperCase();
    return read(charId).find((d) => d.caseNumber.toUpperCase() === wanted) || null;
  }

  function saveQuiet(charId: string, input: unknown): Docket {
    const data = clean(input);
    data.updated = new Date().toISOString();
    if (!data.caseNumber) throw new Error("A docket needs a case number.");
    const all = read(charId);
    const upper = data.caseNumber.toUpperCase();
    if (all.some((x) => x.id !== data.id && x.caseNumber.toUpperCase() === upper)) {
      throw new Error(data.caseNumber + " is already on this docket.");
    }
    const i = all.findIndex((x) => x.id === data.id);
    if (i >= 0) all[i] = data;
    else all.push(data);
    write(charId, all);
    return data;
  }

  return {
    list(charId) {
      return isId(charId) ? read(charId).sort(compare) : [];
    },
    get(charId, id) {
      if (!isId(charId)) return null;
      return read(charId).find((d) => d.id === id) || null;
    },
    findByCase,
    save(charId, d) {
      if (!isId(charId)) return null;
      const saved = saveQuiet(charId, d);
      touchCharacter(charId);
      return saved;
    },
    upsert(charId, patch) {
      if (!isId(charId)) return null;
      const existing = findByCase(charId, patch.caseNumber || "");
      const merged: Record<string, unknown> = { ...clean(existing || {}) };
      for (const k of Object.keys(patch)) {
        if (k !== "id" && k !== "__proto__") merged[k] = (patch as Record<string, unknown>)[k];
      }
      if (!existing) delete merged.id;
      const saved = saveQuiet(charId, merged);
      touchCharacter(charId);
      return saved;
    },
    remove(charId, id) {
      if (!isId(charId)) return;
      write(
        charId,
        read(charId).filter((d) => d.id !== id),
      );
      touchCharacter(charId);
    },
    removeAll(charId) {
      if (!isId(charId)) return;
      write(charId, []);
    },
    replace(charId, items) {
      if (!isId(charId)) return;
      const list = (Array.isArray(items) ? items : [])
        .filter((d) => d && typeof d === "object" && (d as Record<string, unknown>).caseNumber)
        .map(clean)
        .filter((d) => d.caseNumber);
      write(charId, list);
    },
    migrate: store.migrate,
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: DocketStore | null = null;

/** The app's docket store (created on first use; client only). */
export function docketStore(): DocketStore {
  if (!instance) instance = createDocketStore(defaultKV());
  return instance;
}
