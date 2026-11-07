// Case notes as dated entries (LP-227): each note has its text, when it was added (the real instant,
// shown in game time) and who added it. They live on the case, so they save, sync and back up with
// it. A case's old single notes box becomes its first note, dated when the case was created. Pure:
// no storage.

import { formatDay } from "./deadlines";
import { gameTime } from "./gameTime";
import { isId, ISO_TIME_RE, newId, text, uniqueById } from "./storage";
import type { CaseNote } from "./types";

export const MAX_NOTES = 500;
export const MAX_NOTE = 4000;

/** Normalise an untrusted note; null when it has no text. */
export function cleanCaseNote(input: unknown): CaseNote | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const body = text(o.text, MAX_NOTE);
  if (!body) return null;
  return {
    id: isId(o.id) ? o.id : newId(),
    text: body,
    at: typeof o.at === "string" && ISO_TIME_RE.test(o.at) ? o.at : new Date().toISOString(),
    ...(isId(o.by) ? { by: o.by } : {}),
  };
}

/** A case's notes, cleaned, without repeated ids, oldest first. */
export function cleanCaseNotes(input: unknown): CaseNote[] {
  return sortNotes(uniqueById(input, cleanCaseNote)).slice(-MAX_NOTES);
}

const sortNotes = (list: CaseNote[]) => [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

/** Two copies of one case's notes as one list: by id, the first list's copy wins. */
export function unionCaseNotes(first: CaseNote[], second: CaseNote[]): CaseNote[] {
  const ids = new Set(first.map((n) => n.id));
  return sortNotes([...first, ...second.filter((n) => !ids.has(n.id))]).slice(-MAX_NOTES);
}

/** A new note from the active character, now. */
export function newCaseNote(body: string, by: string | null | undefined, at = new Date().toISOString()): CaseNote {
  return { id: newId(), text: body.trim().slice(0, MAX_NOTE), at, ...(isId(by) ? { by } : {}) };
}

/**
 * The old notes box as a note, or null when it's empty. Its id comes from its text and date, so two
 * devices (or two characters' old dockets) holding the same box make the same note, not two.
 */
export function legacyNote(notes: unknown, at: string, by: string | null): CaseNote | null {
  const body = text(notes, MAX_NOTE);
  if (!body) return null;
  let h = 0x811c9dc5;
  for (const ch of body + at) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return { id: "note" + h.toString(36), text: body, at, ...(isId(by) ? { by } : {}) };
}

/** "Sat 7 Nov 1990, 12:15": when a note was added, in game time. */
export function noteWhen(at: string): string {
  const t = gameTime(new Date(at));
  return formatDay(t.date) + ", " + t.time;
}
