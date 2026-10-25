// The jump box's search (LP-128): programs, their sections and the court forms,
// matched by name and ranked best first. Pure, so the ranking is tested apart
// from the box itself (JumpBox.tsx).

export type JumpKind = "program" | "section" | "form";

export interface JumpEntry {
  /** Unique, and safe in an element id. */
  id: string;
  kind: JumpKind;
  label: string;
  /** Where it is: the program a section is in, a form's court and section. */
  detail: string;
  href: string;
}

/** What each kind is called in the list and to a screen reader. */
export const KIND_LABELS: Record<JumpKind, string> = { program: "Program", section: "Section", form: "Form" };

const KIND_ORDER: Record<JumpKind, number> = { program: 0, section: 1, form: 2 };

/** At most this many results are listed. */
export const MAX_RESULTS = 50;

/** Lowercase words without punctuation, so "jap" finds "J.A.P." and "speedy-trial" finds "Speedy Trial". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s-]+/g, " ")
    .trim();
}

/** The letters of `q` in order somewhere in `s` ("mtd" in "motion to dismiss"). */
function inOrder(q: string, s: string): boolean {
  let at = 0;
  for (const ch of q.replace(/ /g, "")) {
    at = s.indexOf(ch, at);
    if (at < 0) return false;
    at++;
  }
  return true;
}

/**
 * How well a query matches an entry, lower being better, or null for no match: the whole name,
 * then the start of the name, the start of a word in it, every query word starting a word, the
 * name containing it, where it is (court, section or program) containing it, and last the
 * letters in order.
 */
export function matchScore(query: string, entry: Pick<JumpEntry, "label" | "detail">): number | null {
  const q = normalize(query);
  if (!q) return 0;
  const label = normalize(entry.label);
  const words = label.split(" ");
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (words.some((w) => w.startsWith(q))) return 2;
  const parts = q.split(" ");
  if (parts.length > 1 && parts.every((p) => words.some((w) => w.startsWith(p)))) return 3;
  if (label.includes(q)) return 4;
  if (normalize(entry.detail).includes(q)) return 5;
  if (inOrder(q, label)) return 6;
  return null;
}

/**
 * The entries matching a query, best first; ties keep programs, then sections, then forms, each
 * in the order given. An empty query lists the programs and sections only (the forms are a
 * search away).
 */
export function search(query: string, entries: readonly JumpEntry[]): JumpEntry[] {
  if (!normalize(query)) return entries.filter((e) => e.kind !== "form").slice(0, MAX_RESULTS);
  return entries
    .map((entry, i) => ({ entry, i, score: matchScore(query, entry) }))
    .filter((m): m is { entry: JumpEntry; i: number; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] || a.i - b.i)
    .slice(0, MAX_RESULTS)
    .map((m) => m.entry);
}
