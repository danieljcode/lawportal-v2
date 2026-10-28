// SafeHtml (LP-5): HTML that's safe to put on the page, on the clipboard or
// into a .docx, because everything a user typed in it went through escapeHtml.
//
// It's an ordinary string with a type-only brand, so it costs nothing at run
// time, but a plain string can't be passed where SafeHtml is needed: the
// compiler (and so `npm run build`) refuses it. SafeHtml is produced only by
// the renderers: escapeHtml and render() (src/lib/template/), and renderDiscordHtml
// in discordPreview.ts. tests/safeHtml.test.ts fails if any other file calls
// trustAsSafeHtml.

declare const SAFE_HTML: unique symbol;

export type SafeHtml = string & { readonly [SAFE_HTML]: true };

/**
 * Mark HTML as safe. Only for the renderers named above, after they've
 * escaped every piece of user text; anything else must get its HTML from them.
 */
export function trustAsSafeHtml(html: string): SafeHtml {
  return html as SafeHtml;
}

/** An empty output (nothing rendered yet). */
export const EMPTY_HTML: SafeHtml = trustAsSafeHtml("");
