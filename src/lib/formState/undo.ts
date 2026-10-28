// Undo and redo for a form's edits (LP-89). Pure: FormView keeps an Undoable in
// state and replaces it through these functions.
//
// Typing is grouped into steps: a change with the same key (the field being
// typed in) within GROUP_MS of the last one joins the last step instead of
// starting a new one. Changes without a key (Clear form, a loaded docket, an
// added item) are always a step of their own.

import type { FormState } from "./state";

/** Most steps kept to undo. */
export const UNDO_LIMIT = 100;
/** Typing in one field with pauses shorter than this is one step. */
export const GROUP_MS = 1000;

export interface Undoable {
  state: FormState;
  /** Earlier states, oldest first. */
  past: FormState[];
  /** States undone, the next redo first. */
  future: FormState[];
  /** The last change's grouping key and time. */
  lastKey: string | null;
  lastAt: number;
}

export function startUndo(state: FormState): Undoable {
  return { state, past: [], future: [], lastKey: null, lastAt: 0 };
}

/** Apply a change. `key` groups typing in one field; null starts a step of its own. */
export function change(u: Undoable, next: FormState, key: string | null, now: number): Undoable {
  if (next === u.state) return u;
  const group = key !== null && key === u.lastKey && now - u.lastAt < GROUP_MS && u.past.length > 0;
  return {
    state: next,
    past: group ? u.past : [...u.past, u.state].slice(-UNDO_LIMIT),
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

export function undo(u: Undoable): Undoable {
  if (!u.past.length) return u;
  return {
    state: u.past[u.past.length - 1],
    past: u.past.slice(0, -1),
    future: [u.state, ...u.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo(u: Undoable): Undoable {
  if (!u.future.length) return u;
  return {
    state: u.future[0],
    past: [...u.past, u.state].slice(-UNDO_LIMIT),
    future: u.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}
