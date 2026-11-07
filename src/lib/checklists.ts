// Next-action checklists (LP-230): named lists of routine jobs for a kind of case
// ("Criminal defence", "Civil plaintiff"), added to a case as unassigned next
// actions with no due date. The firm edits them in Settings. One list under
// lawapp_checklists; it syncs per checklist by `updated` and is in the full backup.
// Until the firm changes them, the starter lists below are used.

import { cleanAction, MAX_ACTIONS } from "./actions";
import { ISO_TIME_RE, defaultKV, isId, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";
import type { CaseAction } from "./types";

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

const STARTER_TIME = "2026-11-07T00:00:00.000Z";
const starter = (id: string, name: string, matter: string, items: string[]): Checklist => ({
  id,
  name,
  matter,
  items,
  updated: STARTER_TIME,
});

/** The lists used until the firm edits its own; fixed ids so every device has the same ones. */
export const STARTER_CHECKLISTS: readonly Checklist[] = [
  starter("chkcrimdef", "Criminal defence", "Criminal", [
    "Meet the client",
    "Run a conflict check",
    "File the notice of appearance",
    "Request discovery from the prosecution",
    "Review the arrest report and evidence",
    "Discuss plea options with the client",
    "Prepare for the arraignment",
  ]),
  starter("chkcrimpro", "Prosecution", "Criminal", [
    "Review the arrest report and evidence",
    "Decide the charges",
    "File the complaint",
    "Send discovery to the defence",
    "Contact the witnesses",
    "Prepare for the arraignment",
  ]),
  starter("chkcivplt", "Civil plaintiff", "Civil", [
    "Meet the client",
    "Run a conflict check",
    "Send a demand letter",
    "File the complaint",
    "Serve the defendant",
    "Request discovery",
  ]),
  starter("chkcivdef", "Civil defendant", "Civil", [
    "Meet the client",
    "Run a conflict check",
    "Add the deadline to answer",
    "File the answer",
    "Request discovery",
  ]),
  starter("chktraffic", "Traffic", "Traffic", [
    "Meet the client",
    "Review the citation",
    "File the notice of appearance",
    "Request the officer's report",
  ]),
  starter("chksmall", "Small claims", "Small claims", [
    "Meet the client",
    "Gather receipts and documents",
    "File the claim",
    "Serve the other party",
  ]),
];

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

/** The lists to offer: the firm's own, or the starter lists while it has none. */
export const checklistsOrStarter = (list: readonly Checklist[]): readonly Checklist[] =>
  list.length ? list : STARTER_CHECKLISTS;

/** The first list for a case's matter, else the first list. */
export const checklistFor = (lists: readonly Checklist[], matter: string): Checklist | undefined =>
  lists.find((l) => l.matter === matter) || lists[0];

/** A case's actions with a checklist's items added as new open actions; titles already on the case are skipped. */
export function withChecklist(
  actions: readonly CaseAction[],
  list: Pick<Checklist, "items">,
): { actions: CaseAction[]; added: number; skipped: number } {
  const have = new Set(actions.map((a) => a.title.trim().toLowerCase()));
  const fresh = list.items.filter((t) => !have.has(t.trim().toLowerCase()));
  const room = Math.max(0, MAX_ACTIONS - actions.length);
  const added = fresh.slice(0, room).map((title) => cleanAction({ title })!);
  return { actions: [...actions, ...added], added: added.length, skipped: list.items.length - added.length };
}

export interface ChecklistStore {
  /** The firm's own lists; empty while the starter lists are in use. */
  list(): Checklist[];
  /** Add or change one list (the starter lists become the firm's own first). Throws when it has no name. */
  save(input: Partial<Checklist>): Checklist;
  remove(id: string): void;
  /** Go back to the starter lists. */
  reset(): void;
  /** Replace every list (sync). */
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
  const current = () => [...checklistsOrStarter(store.get())];
  return {
    list: () => store.get(),
    save(input) {
      const c = cleanChecklist({ ...input, updated: undefined });
      if (!c) throw new Error("Give the checklist a name, like Criminal defence.");
      const list = current();
      const i = list.findIndex((x) => x.id === c.id);
      if (i < 0 && list.length >= MAX_CHECKLISTS) throw new Error("Up to " + MAX_CHECKLISTS + " checklists.");
      if (i < 0) list.push(c);
      else list[i] = c;
      store.set(list);
      return c;
    },
    // shortcut: removing every list brings the starter lists back; add an "empty on purpose" flag if firms want none.
    remove(id) {
      store.set(current().filter((x) => x.id !== id));
    },
    reset() {
      store.set([]);
    },
    replaceAll(items) {
      store.set(validList(items));
    },
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
