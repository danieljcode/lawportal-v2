// Next actions on cases (LP-170): the everyday work a court deadline doesn't
// cover ("Request disclosure", "Call the client"), each with an optional owner
// (a character id) and an optional in-game due date, done or open. They live on
// the case, so they save, sync and back up with it. Pure: no storage.

import { isId, ISO_DATE_RE, newId, text, uniqueById } from "./storage";
import type { CaseAction } from "./types";

export const MAX_ACTIONS = 100;

/** Normalise an untrusted action; null when it has no title. */
export function cleanAction(input: unknown): CaseAction | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const title = text(o.title, 120);
  if (!title) return null;
  return {
    id: isId(o.id) ? o.id : newId(),
    title,
    ...(isId(o.owner) ? { owner: o.owner } : {}),
    ...(typeof o.due === "string" && ISO_DATE_RE.test(o.due) ? { due: o.due } : {}),
    ...(o.done === true ? { done: true } : {}),
  };
}

/** A case's actions, cleaned, without repeated ids, in the order they were added. */
export function cleanActions(input: unknown): CaseAction[] {
  return uniqueById(input, cleanAction).slice(0, MAX_ACTIONS);
}

/** Two copies of one case's actions as one list: by id, the first list's copy wins. */
export function unionActions(first: CaseAction[], second: CaseAction[]): CaseAction[] {
  const ids = new Set(first.map((a) => a.id));
  return [...first, ...second.filter((a) => !ids.has(a.id))].slice(0, MAX_ACTIONS);
}

/** Open actions to show: soonest due first, then those with no date, each in the order added. */
export function openActions(list: readonly CaseAction[]): CaseAction[] {
  const open = list.filter((a) => !a.done);
  return [
    ...open.filter((a) => a.due).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0)),
    ...open.filter((a) => !a.due),
  ];
}

export function doneActions(list: readonly CaseAction[]): CaseAction[] {
  return list.filter((a) => a.done);
}

export function isOverdue(a: CaseAction, today: string): boolean {
  return !a.done && !!a.due && a.due < today;
}
