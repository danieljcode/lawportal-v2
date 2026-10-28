// HTML to plain text (hints, labels and character counts).

/* ------------------------------------------------------------------ plain */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: "\u00a0",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function fromCodePoint(code: number, raw: string): string {
  if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return raw;
  return String.fromCodePoint(code);
}

/** Plain text of a fallback snippet, for input placeholders (DOM-free `textContent`). */
export function plain(html: string): string {
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:(nbsp|amp|lt|gt|quot|apos)|#(\d+)|#[xX]([0-9a-fA-F]+));/g,
      (raw, name?: string, dec?: string, hex?: string) => {
        if (name) return NAMED_ENTITIES[name];
        if (dec) return fromCodePoint(parseInt(dec, 10), raw);
        return fromCodePoint(parseInt(hex as string, 16), raw);
      },
    )
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .slice(0, 160);
}
