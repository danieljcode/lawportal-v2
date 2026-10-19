// Dockets: the cases a judge or lawyer character is handling (INV §e.2).
//
// Since LP-4, cases belong to the firm (cases.ts) and a character's docket is
// a view of them: the cases the character leads or is assigned to. This keeps
// the DocketStore API the Dockets dialog, the docket bar and the J.A.P. use
// until the Case File program takes over (LP-101, LP-100). Behaviour follows
// the reference js_dockets.js, with these changes for shared cases:
//
// - Saving a case number the firm already has puts the character on that case.
// - Removing a case from a docket takes the character off it; the case is only
//   deleted when nobody is left on it.
// - A deleted character (removeAll) is taken off every case, which stay.

import { caseStore, createCaseStore, isMember, members, type CaseStore } from "./cases";
import { clean, compare, FIELDS } from "./docketFields";
import { isId, type KV } from "./storage";
import type { Case, Docket } from "./types";

// Field definitions and helpers that used to live here; imports from "./dockets" keep working.
export { clean, DIVISION_CODES, divisionFor, DOCKETS_PREFIX, FIELDS, STATUSES, type DocketField } from "./docketFields";

export interface DocketStore {
  list(charId: string): Docket[];
  get(charId: string, id: string): Docket | null;
  findByCase(charId: string, caseNumber: string): Docket | null;
  /** Throws "A docket needs a case number." / "<n> is already on this docket."; null for an invalid charId. */
  save(charId: string, d: Partial<Docket> | Record<string, unknown>): Docket | null;
  /** Insert or update by case number, keeping fields the patch doesn't mention. */
  upsert(charId: string, patch: Partial<Docket>): Docket | null;
  /** Take the character off the case (deleting it when nobody is left on it). */
  remove(charId: string, id: string): void;
  /** Take the character off every case; the cases stay (a deleted character, LP-4). */
  removeAll(charId: string): void;
  /** Make a character's docket these cases (a characters import, or a kept-aside sync version). */
  replace(charId: string, items: unknown): void;
  /** Fires after data mutations. */
  subscribe(fn: () => void): () => void;
  version(): number;
}

/** A case as the docket fields only (who works it isn't part of a docket entry). */
function toDocket(c: Case): Docket {
  const out: Record<string, unknown> = { id: c.id };
  for (const f of FIELDS) if (c[f.key] !== undefined) out[f.key] = c[f.key];
  out.updated = c.updated;
  return out as unknown as Docket;
}

const upper = (n: string) => n.trim().toUpperCase();

/** A docket view over a case store, or over a fresh one on `kv` (tests). */
export function createDocketStore(source: CaseStore | KV): DocketStore {
  const cases: CaseStore = "byNumber" in source ? source : createCaseStore(source);
  function own(charId: string): Case[] {
    return isId(charId) ? cases.list().filter((c) => isMember(c, charId)) : [];
  }

  function findOwn(charId: string, caseNumber: string): Case | null {
    const wanted = upper(String(caseNumber || ""));
    return own(charId).find((c) => upper(c.caseNumber) === wanted) || null;
  }

  /** Save a docket entry as a case the character is on. */
  function saveFor(charId: string, input: unknown): Docket {
    const data = clean(input);
    if (!data.caseNumber) throw new Error("A docket needs a case number.");
    const mine = own(charId);
    if (mine.some((x) => x.id !== data.id && upper(x.caseNumber) === upper(data.caseNumber))) {
      throw new Error(data.caseNumber + " is already on this docket.");
    }
    const same = mine.find((x) => x.id === data.id) || cases.byNumber(data.caseNumber);
    let saved: Case;
    if (same) {
      // The character's own case, or the firm's case with this number: they join it.
      const joining = !isMember(same, charId);
      saved = cases.save({
        ...same,
        ...data,
        id: same.id,
        lead: same.lead ?? (joining ? charId : null),
        assigned: joining && same.lead ? [...same.assigned, charId] : same.assigned,
      });
    } else {
      saved = cases.save({ ...data, lead: charId, assigned: [] });
    }
    return toDocket(saved);
  }

  function leave(charId: string, c: Case): void {
    const lead = c.lead === charId ? null : c.lead;
    const assigned = c.assigned.filter((x) => x !== charId);
    if (!lead && !assigned.length) cases.remove(c.id);
    else cases.save({ ...c, lead, assigned });
  }

  return {
    list: (charId) => own(charId).map(toDocket).sort(compare),
    get(charId, id) {
      const c = own(charId).find((x) => x.id === id);
      return c ? toDocket(c) : null;
    },
    findByCase(charId, caseNumber) {
      const c = findOwn(charId, caseNumber);
      return c ? toDocket(c) : null;
    },
    save(charId, d) {
      return isId(charId) ? saveFor(charId, d) : null;
    },
    upsert(charId, patch) {
      if (!isId(charId)) return null;
      const existing = findOwn(charId, patch.caseNumber || "");
      const merged: Record<string, unknown> = existing ? { ...toDocket(existing) } : {};
      for (const k of Object.keys(patch)) {
        if (k !== "id" && k !== "__proto__") merged[k] = (patch as Record<string, unknown>)[k];
      }
      return saveFor(charId, merged);
    },
    remove(charId, id) {
      const c = own(charId).find((x) => x.id === id);
      if (c) leave(charId, c);
    },
    removeAll(charId) {
      if (isId(charId)) cases.unassign(charId);
    },
    replace(charId, items) {
      if (!isId(charId)) return;
      const keep = new Set<string>();
      for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item !== "object" || !(item as Docket).caseNumber) continue;
        const existing = findOwn(charId, String((item as Docket).caseNumber));
        try {
          const saved = saveFor(charId, existing ? { ...item, id: existing.id } : item);
          keep.add(saved.id);
        } catch (err) {
          console.warn("[dockets] skipped a case", err);
        }
      }
      for (const c of own(charId)) if (!keep.has(c.id)) leave(charId, c);
    },
    subscribe: cases.subscribe,
    version: cases.version,
  };
}

let instance: DocketStore | null = null;

/** The app's docket view over the firm's cases (created on first use; client only). */
export function docketStore(): DocketStore {
  if (!instance) instance = createDocketStore(caseStore());
  return instance;
}

/** Everyone on a docket entry's case: for "shared with" notes until LP-101. */
export function caseMembers(id: string): string[] {
  const c = caseStore().get(id);
  return c ? members(c) : [];
}
