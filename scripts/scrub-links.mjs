// Unwraps links to the old forum hosts in form template HTML, keeping the link
// text, and neutralises plain-text host mentions. Shared by port-forms.mjs and
// the tests, so a re-port stays clean.

// Hosts whose links are dropped: the host is, or ends in, this domain.
const BLOCKED_HOST = /(^|\.)gta\.world$/i;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const HREF = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

function blocked(href) {
  try {
    return BLOCKED_HOST.test(new URL(href).hostname);
  } catch {
    return false;
  }
}

// Plain-text mentions of the old hosts, with their neutral replacements.
const TEXT = [[/\bbanking\.gta\.world\b/gi, "online banking"]];

/**
 * @param {string} html
 * @returns {string} the HTML with every blocked-host <a> replaced by its inner HTML
 *   and plain-text host mentions replaced
 */
export function unwrapBlockedLinks(html) {
  let out = html.replace(ANCHOR, (whole, attrs, inner) => {
    const m = HREF.exec(attrs);
    const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
    return blocked(href) ? inner : whole;
  });
  for (const [re, text] of TEXT) out = out.replace(re, text);
  return out;
}
