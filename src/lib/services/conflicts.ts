// Running a conflict check (LP-10): the firm's cases searched, and the check
// logged. Lives here because it spans two stores (cases and the conflict log),
// which don't import each other (LP-3).

import { caseStore } from "../cases";
import { checkConflicts, conflictLog, type ConflictMatch } from "../conflicts";
import type { Character } from "../types";

export interface ConflictRun {
  names: string[];
  matches: ConflictMatch[];
}

/** Check the names against every firm case and log the check (who ran it, when, the result). */
export function runConflictCheck(names: readonly string[], runBy: Character | null): ConflictRun {
  const wanted = names.map((n) => n.trim()).filter(Boolean);
  const matches = checkConflicts(wanted, caseStore().list());
  if (wanted.length) {
    conflictLog().add({
      charId: runBy ? runBy.id : null,
      charName: runBy?.name,
      names: wanted,
      matches: matches.length,
      caseNumbers: [...new Set(matches.map((m) => m.caseNumber))],
    });
  }
  return { names: wanted, matches };
}
