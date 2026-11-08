// A charge list's lines (LP-218), apart from chargeList.ts so the case store can clean the charges
// attached to a case (LP-236) without loading the penal code.

export const MAX_COUNT = 99;
/** More lines than the penal code has charges. */
export const MAX_LINES = 300;

export interface ChargeLine {
  /** "PC 1001". */
  section: string;
  count: number;
}

export const clampCount = (n: unknown) =>
  typeof n === "number" && Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_COUNT) : 1;

/** An untrusted list made safe: each section once, counts 1 to 99. With `known`, only those sections. */
export function cleanChargeLines(raw: unknown, known?: ReadonlySet<string>): ChargeLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ChargeLine[] = [];
  for (const x of raw as Array<Partial<ChargeLine>>) {
    const section = x && typeof x.section === "string" && x.section.length <= 40 ? x.section : "";
    if (!section || seen.has(section) || (known && !known.has(section))) continue;
    seen.add(section);
    out.push({ section, count: clampCount(x.count) });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}
