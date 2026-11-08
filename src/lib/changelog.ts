// "What's new" dialog helpers and its stamp (INV §e.5). The shell's unread dot is in
// changelogSeen.ts, so the entries stay out of the home screen's first load (LP-242).

import { CHANGELOG, type ChangeType, type ChangelogEntry } from "@/data/changelog";

/** Group order and labels in the dialog. */
export const LOG_TYPES: ReadonlyArray<[ChangeType, string]> = [
  ["new", "New"],
  ["update", "Updated"],
  ["fix", "Fixed"],
];

/** Changes whenever an entry is added, or items are added to the newest one. */
export function stamp(log: readonly ChangelogEntry[] = CHANGELOG): string {
  if (!log.length) return "";
  const top = log[0];
  return top.date + "|" + (top.title || "") + "|" + top.items.length + "|" + log.length;
}

/** `2026-10-05` → "October 5, 2026" (in the browser's locale, read as UTC). */
export function friendlyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
