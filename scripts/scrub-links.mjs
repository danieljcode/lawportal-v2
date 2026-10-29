// Unwraps links to the old forum hosts in form template HTML, keeping the link
// text, and neutralises plain-text host mentions. Shared by port-forms.mjs and
// the tests, so a re-port stays clean. Which hosts is private (LP-165): the
// list is blocked-hosts.json in the reference data, read by blockList().
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.agents/reference/jsa/blocked-hosts.json");
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const HREF = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @typedef {{ hosts: string[], text: Array<[string, string]>, brands: string[] }} BlockList
 *   hosts: a link is dropped when its host is, or ends in, one of these; text: plain-text
 *   mentions and their neutral replacements; brands: names no form output may show.
 */

/** @returns {BlockList} the private list, or an empty one without the reference data. */
export function blockList(file = LIST) {
  if (!existsSync(file)) return { hosts: [], text: [], brands: [] };
  const o = JSON.parse(readFileSync(file, "utf8"));
  return { hosts: o.hosts || [], text: o.text || [], brands: o.brands || [] };
}

/**
 * @param {string} html
 * @param {Pick<BlockList, "hosts" | "text">} list
 * @returns {string} the HTML with every blocked-host <a> replaced by its inner HTML
 *   and plain-text host mentions replaced
 */
export function unwrapBlockedLinks(html, list) {
  const blocked = (href) => {
    try {
      const host = new URL(href).hostname.toLowerCase();
      return list.hosts.some((h) => host === h || host.endsWith("." + h));
    } catch {
      return false;
    }
  };
  let out = html.replace(ANCHOR, (whole, attrs, inner) => {
    const m = HREF.exec(attrs);
    const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
    return blocked(href) ? inner : whole;
  });
  for (const [find, text] of list.text) out = out.replace(new RegExp("\\b" + escape(find) + "\\b", "gi"), text);
  return out;
}
