// Sticky notes (LP-55): quick reminders like "Call DA re: plea", one list under
// lawapp_notes, synced per note by `updated` and in the full backup. Modern
// lists them on Home; Classic puts them on the desktop, where x, y, w and h
// place them. Kept small and apart from the UI (src/ui/Notes.tsx), because
// sync loads it with the app shell and the first-load JavaScript has a budget.

import { ISO_TIME_RE, defaultKV, isId, newId, uniqueById, type KV } from "./storage";
import { createStore } from "./store";

export const NOTES_KEY = "lawapp_notes";
const NOTES_VERSION = 1;
export const MAX_NOTES = 50;
export const MAX_NOTE_TEXT = 500;

export const NOTE_COLOURS = ["yellow", "pink", "blue", "green"] as const;
export type NoteColour = (typeof NOTE_COLOURS)[number];

/** A note's size on the Classic desktop, in CSS pixels. */
export const NOTE_SIZE = { w: 180, h: 140, minW: 140, minH: 100, maxW: 420, maxH: 420 };

export interface Note {
  id: string;
  /** As typed: not trimmed, so spaces and new lines survive typing. */
  text: string;
  colour: NoteColour;
  /** The case it's about, if any (click to open it). */
  caseId?: string;
  /** Where it sits on the Classic desktop. */
  x: number;
  y: number;
  w: number;
  h: number;
  created: string;
  updated: string;
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback;
const stamp = (v: unknown, fallback: string) => (typeof v === "string" && ISO_TIME_RE.test(v) ? v : fallback);

/** Normalise an untrusted note; null when it isn't an object. */
export function cleanNote(raw: unknown, now: string = new Date().toISOString()): Note | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const created = stamp(o.created, now);
  return {
    id: isId(o.id) ? o.id : newId(),
    text: typeof o.text === "string" ? o.text.slice(0, MAX_NOTE_TEXT) : "",
    colour: (NOTE_COLOURS as readonly unknown[]).includes(o.colour) ? (o.colour as NoteColour) : "yellow",
    ...(isId(o.caseId) ? { caseId: o.caseId } : {}),
    x: num(o.x, 0, 0, 10_000),
    y: num(o.y, 0, 0, 10_000),
    w: num(o.w, NOTE_SIZE.w, NOTE_SIZE.minW, NOTE_SIZE.maxW),
    h: num(o.h, NOTE_SIZE.h, NOTE_SIZE.minH, NOTE_SIZE.maxH),
    created,
    updated: stamp(o.updated, created),
  };
}

const validList = (raw: unknown): Note[] => uniqueById(raw, (x) => cleanNote(x)).slice(0, MAX_NOTES);

export interface NoteStore {
  /** Every note, newest first. */
  list(): Note[];
  /** A new empty note, placed a step down and right of the last one on the Classic desktop. Null when full. */
  add(colour?: NoteColour): Note | null;
  /** Save changes to one note, stamping `updated`. */
  save(note: Note): void;
  remove(id: string): void;
  /** Replace every note (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createNoteStore(kv: KV): NoteStore {
  const store = createStore<Note[]>(kv, {
    key: NOTES_KEY,
    version: NOTES_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  const newestFirst = (l: Note[]) =>
    [...l].sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
  return {
    list: () => newestFirst(store.get()),
    add(colour = "yellow") {
      const all = store.get();
      if (all.length >= MAX_NOTES) return null;
      const step = (all.length % 8) * 24;
      const now = new Date().toISOString();
      const note = cleanNote({ id: newId(), text: "", colour, x: 16 + step, y: 16 + step, created: now }, now)!;
      store.set([...all, note]);
      return note;
    },
    save(note) {
      const clean = cleanNote({ ...note, updated: new Date().toISOString() });
      if (clean) store.set(store.get().map((n) => (n.id === clean.id ? clean : n)));
    },
    remove: (id) => store.set(store.get().filter((n) => n.id !== id)),
    replaceAll: (items) => store.set(validList(items)),
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: NoteStore | null = null;

/** The sticky notes (created on first use; client only). */
export function noteStore(): NoteStore {
  if (!instance) instance = createNoteStore(defaultKV());
  return instance;
}
