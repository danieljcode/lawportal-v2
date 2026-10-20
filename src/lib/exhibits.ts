// Exhibits on a case (LP-12): each piece of evidence with a title, a
// description, a link (stored only, never fetched) and the date it was
// obtained. They're kept in order on the case, and an exhibit's letter comes
// from its place (A, B… Z, AA, AB…), so reordering relabels them; references
// to an exhibit (LP-13) keep its id, not its letter. They live on the case, so
// they sync and back up with it. Pure: no storage.

import { isId, ISO_DATE_RE, newId } from "./storage";
import type { Exhibit } from "./types";

export const MAX_EXHIBITS = 200;

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

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
  return {
    id: isId(o.id) ? o.id : newId(),
    title,
    ...(description ? { description } : {}),
    ...(link ? { link } : {}),
    ...(obtained ? { obtained } : {}),
  };
}

/** A case's exhibits, cleaned, in their saved order, without repeated ids. */
export function cleanExhibits(input: unknown): Exhibit[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Exhibit[] = [];
  for (const item of input) {
    const e = cleanExhibit(item);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.slice(0, MAX_EXHIBITS);
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

/** Two copies of one case's exhibits as one list: the first copy's order, then any only the second has. */
export function unionExhibits(first: Exhibit[], second: Exhibit[]): Exhibit[] {
  const ids = new Set(first.map((e) => e.id));
  return [...first, ...second.filter((e) => !ids.has(e.id))].slice(0, MAX_EXHIBITS);
}
