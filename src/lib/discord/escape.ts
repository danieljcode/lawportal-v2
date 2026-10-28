// Escaping text so Discord shows it literally (never formats or pings).

/* ---------------------------------------------------------------- escaping */

/** Backslash-escape markdown in plain text; defuse mass mentions and `<…>` tokens. */
export function escapeMarkdown(s: string): string {
  return s
    .replace(/[\\*_~|`<]/g, "\\$&")
    .replace(/\]\(/g, "]\\(")
    .replace(/@(everyone|here)/gi, "@\u200b$1");
}

/** Escape a line start that Discord would read as a heading, quote or list. */
export function escapeLineStart(s: string): string {
  if (/^\d+\. /.test(s)) return s.replace(/^(\d+)\. /, "$1\\. ");
  if (/^(#|>|-#|[-+] )/.test(s)) return "\\" + s;
  return s;
}
