// The "What's new" unread dot (INV §e.5). It takes the stamp, not the entries, so the shell
// loads without them: the page works the stamp out on the server (LP-242).

import { defaultKV, type KV } from "./storage";

export const SEEN_KEY = "lawapp_changelog_seen";

/** Unread until `stamp` (lib/changelog's `stamp()`) is marked seen; an empty stamp is never unread. */
export function isUnread(stamp: string, kv: KV = defaultKV()): boolean {
  return stamp !== "" && kv.get(SEEN_KEY) !== stamp;
}

/** Remember that the current entries were seen (hides the dot). */
export function markSeen(stamp: string, kv: KV = defaultKV()): void {
  try {
    kv.set(SEEN_KEY, stamp);
  } catch {
    // blocked storage: the dot comes back next visit
  }
}
