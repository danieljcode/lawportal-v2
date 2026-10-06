// Static safety check for form template HTML (DES §Data step 3b).
// Runs on the raw template string, tokens included, so fallback HTML inside
// {{…|fallback}} is checked as well. Shared by port-forms.mjs and the tests.

const DANGEROUS_TAG = /<\s*(script|iframe|object|embed|style|link|meta|base|form|input|textarea|button|svg|math)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;
const DANGEROUS_SCHEME = /javascript:|vbscript:|data:(?!image\/(png|jpe?g|gif|webp);)/i;
const URL_ATTR = /\b(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const HTTP_URL = /^https?:\/\//i;

/**
 * @param {string} html
 * @returns {string[]} one message per problem found (empty when the template is safe)
 */
export function checkTemplateHtml(html) {
  const problems = [];
  const tag = DANGEROUS_TAG.exec(html);
  if (tag) problems.push(`dangerous tag <${tag[1].toLowerCase()}>`);
  const ev = EVENT_ATTR.exec(html);
  if (ev) problems.push(`event attribute "${ev[0].trim()}"`);
  const scheme = DANGEROUS_SCHEME.exec(html);
  if (scheme) problems.push(`dangerous scheme "${scheme[0]}"`);
  for (const m of html.matchAll(URL_ATTR)) {
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    // A dangerous scheme was already reported above; report each bad value once.
    if (DANGEROUS_SCHEME.test(value)) continue;
    if (!HTTP_URL.test(value)) problems.push(`${m[1].toLowerCase()} is not an http(s) URL: "${value}"`);
  }
  return problems;
}
