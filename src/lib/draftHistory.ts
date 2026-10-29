// Draft history (LP-89): earlier versions of each form's draft, so a bad paste
// or an accidental Clear form can be undone later. One list per form under
// lawapp_history_<form id>, newest last, on the keyed store base (LP-2/LP-99).
//
// FormView keeps a snapshot every few minutes while the form is edited, and
// before Clear form or a restore. Each form keeps the last MAX_SNAPSHOTS; if
// storage is full, the oldest are dropped until the list fits. The keys start
// lawapp_, so the full backup (LP-1) includes them; they aren't synced, as
// drafts aren't.

import { toFormState, type FormState } from "./formState";
import { formatDay } from "./deadlines";
import { gameTime } from "./gameTime";
import { defaultKV, ISO_TIME_RE, type KV } from "./storage";
import { createKeyedStore } from "./store";
import type { Values } from "./types";

export const HISTORY_PREFIX = "lawapp_history_";
export const HISTORY_VERSION = 1;
export const MAX_SNAPSHOTS = 20;
/** A snapshot is kept at most this often while a form is being edited. */
export const SNAPSHOT_EVERY_MS = 3 * 60 * 1000;

export interface Snapshot {
  /** Real (not in-game) time, ISO. */
  at: string;
  state: FormState;
}

/** Form ids: lowercase letters, digits and dashes ("civil-complaint", "extra-subpoena"). */
const FORM_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

function validList(raw: unknown): Snapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: Snapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { at, state } = item as Record<string, unknown>;
    const s = toFormState(state);
    if (typeof at === "string" && ISO_TIME_RE.test(at) && s) out.push({ at, state: s });
  }
  return out;
}

/** Whether a form has anything typed, ticked or chosen in it. */
export function hasContent(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "";
  if (v === true) return true;
  if (Array.isArray(v)) return v.some(hasContent);
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => !k.startsWith("?") && hasContent(x));
  return false;
}

/** How many fields hold something, for the list. */
export function filledCount(values: Values): number {
  let n = 0;
  const walk = (v: unknown, key: string) => {
    if (key.startsWith("?")) return;
    if (Array.isArray(v)) for (const item of v) walk(item, "");
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    else if ((typeof v === "string" && v.trim()) || v === true) n++;
  };
  walk(values, "");
  return n;
}

/** A snapshot's time on the 1990 calendar, New York time: "Sun 25 Oct 1990, 14:05". */
export function snapshotTime(at: string): string {
  const t = gameTime(new Date(at));
  return formatDay(t.date) + ", " + t.time;
}

export interface DraftHistory {
  /** A form's snapshots, newest first. */
  list(formId: string): Snapshot[];
  /**
   * Keep a snapshot of `state`, unless the form is empty or it matches the newest one.
   * Returns whether one was kept (false too when storage refused even a single snapshot).
   */
  add(formId: string, state: FormState, now?: Date): boolean;
  /** When the newest snapshot was taken (ms), or 0. */
  lastAt(formId: string): number;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createDraftHistory(kv: KV): DraftHistory {
  const store = createKeyedStore<Snapshot[]>(kv, {
    prefix: HISTORY_PREFIX,
    isId: (id) => FORM_ID.test(id),
    version: HISTORY_VERSION,
    validate: validList,
    isEmpty: (list) => list.length === 0,
  });

  return {
    list: (formId) => store.get(formId).reverse(),
    lastAt(formId) {
      const list = store.get(formId);
      return list.length ? Date.parse(list[list.length - 1].at) : 0;
    },
    add(formId, state, now = new Date()) {
      if (!FORM_ID.test(formId) || !hasContent(state.values)) return false;
      const list = store.get(formId);
      const newest = list[list.length - 1];
      if (newest && JSON.stringify(newest.state.values) === JSON.stringify(state.values)) return false;
      const snap: Snapshot = {
        at: now.toISOString(),
        state: { values: state.values, autofilled: state.autofilled, derived: state.derived },
      };
      let next = [...list, snap].slice(-MAX_SNAPSHOTS);
      // Storage full: drop the oldest until it fits (the newest is kept longest).
      for (;;) {
        try {
          store.set(formId, next);
          return true;
        } catch {
          if (next.length <= 1) return false;
          next = next.slice(Math.max(1, Math.floor(next.length / 4)));
        }
      }
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: DraftHistory | null = null;

/** The app's draft history (created on first use; client only). */
export function draftHistory(): DraftHistory {
  if (!instance) instance = createDraftHistory(defaultKV());
  return instance;
}
