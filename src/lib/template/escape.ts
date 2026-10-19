// Escaping text for HTML: the one way user text gets into a filing (LP-5: SafeHtml).

import { trustAsSafeHtml, type SafeHtml } from "../safeHtml";

/** Text as HTML: `&`, `<`, `>` and `"` become entities, so it can never become markup (LP-5: SafeHtml). */
export function escapeHtml(s: unknown): SafeHtml {
  return trustAsSafeHtml(
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  );
}
