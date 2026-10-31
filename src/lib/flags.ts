// Feature flags (LP-120): unfinished work merges switched off, so `main` can always be released.
// A flag is on only while the page's address names it (`?flags=ledger,find`); nothing stores it,
// so a player never turns one on by accident. Delete a flag once its feature ships.

/** Every flag, with the Jira issue it belongs to. Each is off unless `?flags=` names it. */
export const FLAGS = {
  ledger: { jira: "LP-32" },
  rolodex: { jira: "LP-30" },
} as const satisfies Record<string, { jira: string }>;

export type Flag = keyof typeof FLAGS;

/** The flags a query string turns on: `?flags=a,b` → {a, b}. */
export function flagsIn(search: string): Set<string> {
  const list = new URLSearchParams(search).get("flags") ?? "";
  return new Set(
    list
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean),
  );
}

/** Whether a flag is on for this page. */
export function flagOn(flag: Flag, search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return flagsIn(search).has(flag);
}
