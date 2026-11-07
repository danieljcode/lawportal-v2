// The firm's next-action checklists as stored (LP-230): one list under
// lawapp_checklists, synced per checklist by `updated` and in the full backup.
// Kept apart from checklists.ts (starter lists, editing) because sync loads it
// with the app shell, and the first-load JavaScript has a budget.

import { ISO_TIME_RE, defaultKV, isId, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";

export const CHECKLISTS_KEY = "lawapp_checklists";
const CHECKLISTS_VERSION = 1;
export const MAX_CHECKLISTS = 50;
export const MAX_CHECKLIST_ITEMS = 40;

export interface Checklist {
  id: string;
  name: string;
  /** The matter it's for (firmRecord MATTERS: Criminal, Civil, Traffic, Small claims, Other). */
  matter: string;
  /** Next-action titles, in order. */
  items: string[];
  updated: string;
}

/** Normalise an untrusted checklist; null without a name. Blank and repeated items are dropped. */
export function cleanChecklist(raw: unknown, now: string = new Date().toISOString()): Checklist | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = text(o.name, 80);
  if (!name) return null;
  const seen = new Set<string>();
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((x) => text(x, 120))
    .filter((x): x is string => !!x && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()))
    .slice(0, MAX_CHECKLIST_ITEMS);
  return {
    id: isId(o.id) ? o.id : newId(),
    name,
    matter: text(o.matter, 40) || "Other",
    items,
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : now,
  };
}

const validList = (raw: unknown): Checklist[] => uniqueById(raw, (x) => cleanChecklist(x)).slice(0, MAX_CHECKLISTS);

export interface ChecklistStore {
  /** The firm's own lists; empty while the starter lists are in use. */
  list(): Checklist[];
  /** Replace every list (editing in Settings, and sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createChecklistStore(kv: KV): ChecklistStore {
  const store = createStore<Checklist[]>(kv, {
    key: CHECKLISTS_KEY,
    version: CHECKLISTS_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  return {
    list: () => store.get(),
    replaceAll: (items) => store.set(validList(items)),
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: ChecklistStore | null = null;

/** The firm's checklists (created on first use; client only). */
export function checklistStore(): ChecklistStore {
  if (!instance) instance = createChecklistStore(defaultKV());
  return instance;
}
