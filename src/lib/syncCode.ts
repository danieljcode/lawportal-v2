// The sync code format, shared by the client and the server (this file has no Node imports).
// Codes are JSA- and 5 groups of 4 symbols from an alphabet without the look-alikes I, O, 0 and 1.
export const CODE_RE = /^JSA(-[A-HJ-NP-Z2-9]{4}){5}$/;

const SYMBOLS = 20;

export const LOOKALIKE_HINT = "Sync codes don't use O, 0, I or 1.";

/** The letters and digits typed, upper-cased, without the JSA prefix (typing it is optional). */
function symbols(typed: string): string {
  const s = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A code typed without its prefix can itself start with JSA: then it's exactly 20 symbols.
  return s.startsWith("JSA") && s.length !== SYMBOLS ? s.slice(3) : s;
}

/** A code as typed, made regular (LP-53): "jsa abcd efgh…" and "ABCDEFGH…" both become "JSA-ABCD-EFGH-…". */
export function normaliseCode(typed: string): string {
  return ["JSA", ...(symbols(typed).match(/.{1,4}/g) ?? [])].join("-");
}

/** What to show under the code box as it's typed: the code as it will be used, or what's wrong. */
export function codeHint(typed: string): { text: string; ok: boolean } {
  const s = symbols(typed);
  if (!s) return { text: "", ok: false };
  if (/[OI01]/.test(s)) return { text: LOOKALIKE_HINT, ok: false };
  if (s.length > SYMBOLS) return { text: "That's longer than a sync code.", ok: false };
  const code = normaliseCode(typed);
  if (s.length < SYMBOLS) return { text: code + " (" + s.length + " of " + SYMBOLS + ")", ok: false };
  return { text: code, ok: true };
}
