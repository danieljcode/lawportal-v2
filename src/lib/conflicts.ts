// Conflict check (LP-10): a new client's name (or several) against every firm
// case's parties and notes, so the firm never acts for both sides. Matching is
// forgiving: case and punctuation don't matter, a part of a name matches
// ("Lee" finds "Ann Lee"), and so do initials ("A. Lee"). Business suffixes
// (LLC, Inc…) are ignored. Each check is logged, firm-wide and synced, so the
// firm can show it was done.

import { formatDay } from "./deadlines";
import { defaultKV, isId, ISO_TIME_RE, newId, uniqueById, type KV } from "./storage";
import { createStore } from "./store";
import type { Case } from "./types";

/* ---------- matching ---------- */

const IGNORED = new Set(["the", "and", "of", "llc", "inc", "ltd", "corp", "co", "company", "mr", "mrs", "ms", "dr"]);

/** A name as matchable words: lowercase, no punctuation, no filler or suffixes. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !IGNORED.has(w));
}

/** Whether one searched word matches one word of a name: equal, a prefix (3+ letters), or an initial. */
function wordMatches(q: string, w: string): "exact" | "partial" | null {
  if (q === w) return "exact";
  if (q.length === 1) return w.startsWith(q) ? "partial" : null;
  if (q.length >= 3 && w.startsWith(q)) return "partial";
  return null;
}

/**
 * How a searched name matches a name: "exact" when every word matches a word
 * of it exactly, "partial" when every word matches (prefixes, initials), or
 * null. A single initial on its own never matches.
 */
export function nameMatch(query: string, name: string): "exact" | "partial" | null {
  const q = nameWords(query);
  const w = nameWords(name);
  if (!q.length || !w.length || q.every((x) => x.length === 1)) return null;
  const used = new Set<number>();
  let exact = true;
  for (const qw of q) {
    let found = -1;
    let how: "exact" | "partial" | null = null;
    // Prefer an exact word, then a partial one.
    for (let i = 0; i < w.length && how !== "exact"; i++) {
      if (used.has(i)) continue;
      const m = wordMatches(qw, w[i]);
      if (m && (how === null || m === "exact")) {
        found = i;
        how = m;
      }
    }
    if (found < 0) return null;
    used.add(found);
    if (how !== "exact") exact = false;
  }
  return exact ? "exact" : "partial";
}

/** The names in a party field: "Ann Lee, Bo Day and Co" → three names. */
export function partyNames(field: string | undefined): string[] {
  return (field || "")
    .split(/,|;|&|\band\b|\bv\.?\s/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type ConflictSide = "plaintiff" | "defendant" | "notes";

export const SIDE_LABELS: Readonly<Record<ConflictSide, string>> = {
  plaintiff: "Plaintiff / petitioner",
  defendant: "Defendant / respondent",
  notes: "Named in the case notes",
};

export interface ConflictMatch {
  caseId: string;
  caseNumber: string;
  side: ConflictSide;
  /** The name searched for, and what it matched. */
  searched: string;
  matched: string;
  strength: "exact" | "partial";
  status: string;
  lead: string | null;
}

/** Runs of words in the notes as long as the searched name, to find a name mentioned there. */
function noteMatches(query: string, notes: string): string | null {
  const len = nameWords(query).length;
  const words = notes.split(/\s+/).filter(Boolean);
  for (let i = 0; i + len <= words.length; i++) {
    const run = words.slice(i, i + len).join(" ");
    if (nameMatch(query, run) === "exact") return run.replace(/[^\w\s'-]/g, "");
  }
  return null;
}

/** Every match for the names across the firm's cases: parties first, then notes. */
export function checkConflicts(names: readonly string[], cases: readonly Case[]): ConflictMatch[] {
  const out: ConflictMatch[] = [];
  for (const searched of names.map((n) => n.trim()).filter(Boolean)) {
    for (const c of cases) {
      const base = { caseId: c.id, caseNumber: c.caseNumber, searched, status: c.status, lead: c.lead };
      let onParty = false;
      for (const side of ["plaintiff", "defendant"] as const) {
        for (const name of partyNames(c[side])) {
          const strength = nameMatch(searched, name);
          if (strength) {
            out.push({ ...base, side, matched: name, strength });
            onParty = true;
          }
        }
      }
      if (!onParty && c.notes) {
        const found = noteMatches(searched, c.notes);
        if (found) out.push({ ...base, side: "notes", matched: found, strength: "exact" });
      }
    }
  }
  return out;
}

/* ---------- the log ---------- */

export const CONFLICT_LOG_KEY = "lawapp_conflict_log";
export const CONFLICT_LOG_VERSION = 1;
export const MAX_CONFLICT_LOG = 300;

export interface ConflictCheck {
  id: string;
  /** Real (not in-game) time, ISO. */
  at: string;
  charId: string | null;
  charName?: string;
  names: string[];
  /** How many matches, and on which cases. */
  matches: number;
  caseNumbers: string[];
}

export function cleanCheck(input: unknown): ConflictCheck | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.at !== "string" || !ISO_TIME_RE.test(o.at)) return null;
  const names = Array.isArray(o.names)
    ? o.names.filter((n): n is string => typeof n === "string" && !!n.trim()).map((n) => n.trim().slice(0, 120))
    : [];
  if (!names.length) return null;
  return {
    id: isId(o.id) ? o.id : newId(),
    at: o.at,
    charId: isId(o.charId) ? o.charId : null,
    ...(typeof o.charName === "string" && o.charName.trim() ? { charName: o.charName.trim().slice(0, 120) } : {}),
    names: names.slice(0, 20),
    matches: typeof o.matches === "number" && o.matches >= 0 ? Math.floor(o.matches) : 0,
    caseNumbers: Array.isArray(o.caseNumbers)
      ? [...new Set(o.caseNumbers.filter((n): n is string => typeof n === "string"))].slice(0, 50)
      : [],
  };
}

function validLog(raw: unknown): ConflictCheck[] {
  return uniqueById(raw, cleanCheck).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export interface ConflictLog {
  /** Newest first. */
  list(): ConflictCheck[];
  /** Log a check; returns the entry. */
  add(check: Omit<ConflictCheck, "id" | "at"> & { at?: string }): ConflictCheck | null;
  /** Replace the whole log (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createConflictLog(kv: KV): ConflictLog {
  const store = createStore<ConflictCheck[]>(kv, {
    key: CONFLICT_LOG_KEY,
    version: CONFLICT_LOG_VERSION,
    validate: validLog,
    isEmpty: (l) => l.length === 0,
  });
  return {
    list: () => store.get().reverse(),
    add(input) {
      const entry = cleanCheck({ ...input, id: newId(), at: input.at || new Date().toISOString() });
      if (!entry) return null;
      store.set([...store.get(), entry].slice(-MAX_CONFLICT_LOG));
      return entry;
    },
    replaceAll(items) {
      store.set(validLog(items).slice(-MAX_CONFLICT_LOG));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: ConflictLog | null = null;

/** The app's conflict check log (created on first use; client only). */
export function conflictLog(): ConflictLog {
  if (!instance) instance = createConflictLog(defaultKV());
  return instance;
}

/* ---------- the memo ---------- */

export const VERDICT_CLEAR = "No conflicts found";
export const VERDICT_REVIEW = "Possible conflict: review before accepting";

/** The check as a short memo to copy or print. */
export function conflictMemo(
  names: readonly string[],
  matches: readonly ConflictMatch[],
  inGameDay: string,
  runBy: string | undefined,
  nameOf: (charId: string) => string,
): string {
  const lines = [
    "Conflict check",
    "Date: " + formatDay(inGameDay),
    ...(runBy ? ["Run by: " + runBy] : []),
    "Names checked: " + names.filter((n) => n.trim()).join("; "),
    "Result: " + (matches.length ? VERDICT_REVIEW : VERDICT_CLEAR),
  ];
  if (matches.length) {
    lines.push("", "Matches:");
    for (const m of matches) {
      lines.push(
        "- " +
          [
            m.caseNumber,
            SIDE_LABELS[m.side],
            m.status,
            "Lead: " + (m.lead ? nameOf(m.lead) : "none"),
            '"' + m.searched + '" matched "' + m.matched + '"' + (m.strength === "partial" ? " (partial)" : ""),
          ].join(" · "),
      );
    }
  }
  return lines.join("\n");
}
