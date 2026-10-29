// Exhibits on a case (LP-12): each piece of evidence with a title, a
// description, a link (stored only, never fetched) and the date it was
// obtained. They're kept in order on the case, and an exhibit's letter comes
// from its place (A, B… Z, AA, AB…), so reordering relabels them; references
// to an exhibit (LP-13) keep its id, not its letter. They live on the case, so
// they sync and back up with it. Pure: no storage.

import { cleanCustody, unionCustody } from "./custody";
import { isId, ISO_DATE_RE, newId, text, uniqueById } from "./storage";
import type { Exhibit } from "./types";

export const MAX_EXHIBITS = 200;

/** An http(s) link as given, or undefined: no javascript:, data: or anything else. */
export function safeLink(v: unknown): string | undefined {
  const s = text(v, 2000);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
}

/** Normalise an untrusted exhibit; null without a title. */
export function cleanExhibit(input: unknown): Exhibit | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const title = text(o.title, 200);
  if (!title) return null;
  const description = text(o.description, 4000);
  const link = safeLink(o.link);
  const obtained = typeof o.obtained === "string" && ISO_DATE_RE.test(o.obtained) ? o.obtained : undefined;
  const custody = cleanCustody(o.custody);
  return {
    id: isId(o.id) ? o.id : newId(),
    title,
    ...(description ? { description } : {}),
    ...(link ? { link } : {}),
    ...(obtained ? { obtained } : {}),
    ...(custody.length ? { custody } : {}),
  };
}

/** A case's exhibits, cleaned, in their saved order, without repeated ids. */
export function cleanExhibits(input: unknown): Exhibit[] {
  return uniqueById(input, cleanExhibit).slice(0, MAX_EXHIBITS);
}

/** The letter for the exhibit at `index`: 0 → A, 25 → Z, 26 → AA, 27 → AB… */
export function exhibitLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Move an exhibit up (-1) or down (+1); the same list when it can't move. */
export function moveExhibit(list: Exhibit[], id: string, delta: number): Exhibit[] {
  const i = list.findIndex((e) => e.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  next.splice(j, 0, next.splice(i, 1)[0]);
  return next;
}

/**
 * Two copies of one case's exhibits as one list: the first copy's order and details, then any
 * only the second has. An exhibit in both keeps every custody entry either copy has (LP-14).
 */
export function unionExhibits(first: Exhibit[], second: Exhibit[]): Exhibit[] {
  const other = new Map(second.map((e) => [e.id, e]));
  const merged = first.map((e) => {
    const o = other.get(e.id);
    if (!o?.custody?.length) return e;
    return { ...e, custody: unionCustody(e.custody || [], o.custody) };
  });
  const ids = new Set(first.map((e) => e.id));
  return [...merged, ...second.filter((e) => !ids.has(e.id))].slice(0, MAX_EXHIBITS);
}

/* ---------- references in filings (LP-13) ---------- */

/** What a filing needs to show an exhibit: its id, current letter, title and link. */
export interface ExhibitRef {
  id: string;
  letter: string;
  title: string;
  link?: string;
}

/** A case's exhibits as they stand now, lettered. */
export function exhibitRefs(exhibits: readonly Exhibit[]): ExhibitRef[] {
  return exhibits.map((e, i) => ({
    id: e.id,
    letter: exhibitLetter(i),
    title: e.title,
    ...(e.link ? { link: e.link } : {}),
  }));
}

/**
 * A reference typed into a form's text: "[Exhibit C: Dashcam footage #<id>]".
 * The id is what counts; the letter and title are only for reading it in the
 * editor, and are brought up to date when the exhibits change.
 */
const REF = /\[Exhibit ([^\]\n#]*?)\s*#([a-z0-9]{4,32})\]/g;

export function exhibitMarker(ref: ExhibitRef): string {
  return "[Exhibit " + ref.letter + ": " + ref.title.replace(/[\]#\n]/g, " ") + " #" + ref.id + "]";
}

/** Apply `fn` to every string in the values (inside repeatable blocks too); the same object when nothing changes. */
function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as unknown as T;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const n = mapStrings(v, fn);
      if (n !== v) changed = true;
      return n;
    });
    return (changed ? out : value) as unknown as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const n = mapStrings(v, fn);
      if (n !== v) changed = true;
      out[k] = n;
    }
    return (changed ? out : value) as T;
  }
  return value;
}

/**
 * The text a filing shows for each reference: "Exhibit C (Dashcam footage)",
 * with the exhibit's letter and title now. A reference to an exhibit that's
 * gone keeps what it said, without the id. Done before rendering, so the text
 * is escaped like any other value.
 */
export function resolveExhibitRefs<T>(values: T, refs: readonly ExhibitRef[]): T {
  const byId = new Map(refs.map((r) => [r.id, r]));
  return mapStrings(values, (s) =>
    s.includes("[Exhibit ")
      ? s.replace(REF, (_, said: string, id: string) => {
          const r = byId.get(id);
          if (r) return "Exhibit " + r.letter + " (" + r.title + ")";
          const [letter, ...title] = said.split(":");
          return "Exhibit " + letter.trim() + (title.join(":").trim() ? " (" + title.join(":").trim() + ")" : "");
        })
      : s,
  );
}

/** The references' editor text brought up to date (letters after a reorder, renamed titles). */
export function refreshExhibitRefs<T>(values: T, refs: readonly ExhibitRef[]): T {
  const byId = new Map(refs.map((r) => [r.id, r]));
  return mapStrings(values, (s) =>
    s.includes("[Exhibit ")
      ? s.replace(REF, (whole: string, _said: string, id: string) => {
          const r = byId.get(id);
          return r ? exhibitMarker(r) : whole;
        })
      : s,
  );
}
