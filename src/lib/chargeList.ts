// The Law Library's charge calculator (LP-218): charges picked from the penal code, each with a
// count, totalled into time and fine. The list is kept per device in localStorage (not synced).
// Charges with no set time (the judge's discretion) aren't added up; they're listed apart.

import { chargeCitation, months, PENAL_CODE, type Charge, type PenalCode } from "./penalCode";
import { defaultKV, readJson, writeJson, type KV } from "./storage";

export const CHARGE_LIST_KEY = "lawapp_charge_list";
export const MAX_COUNT = 99;

export interface ChargeLine {
  /** "PC 1001". */
  section: string;
  count: number;
}

export interface ChargeTotals {
  /** Default time, then the range, in months, over the charges with set time. */
  jail: number;
  min: number;
  max: number;
  /** Dollars, over every charge. */
  fine: number;
  /** Charges with set time, counted. */
  counted: number;
  /** Charges left to the judge (no default time). */
  discretion: Charge[];
}

const clampCount = (n: unknown) =>
  typeof n === "number" && Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_COUNT) : 1;

/** The saved list, keeping only charges still in the code, each once. */
export function readChargeList(kv: KV = defaultKV(), code: PenalCode = PENAL_CODE): ChargeLine[] {
  const raw = readJson<unknown>(kv, CHARGE_LIST_KEY);
  if (!Array.isArray(raw)) return [];
  const known = new Set(code.charges.map((c) => c.section));
  const seen = new Set<string>();
  const out: ChargeLine[] = [];
  for (const x of raw as Array<Partial<ChargeLine>>) {
    const section = x && typeof x.section === "string" ? x.section : "";
    if (!known.has(section) || seen.has(section)) continue;
    seen.add(section);
    out.push({ section, count: clampCount(x.count) });
  }
  return out;
}

/** Save the list. False when the browser refused the write. */
export function writeChargeList(list: readonly ChargeLine[], kv: KV = defaultKV()): boolean {
  try {
    writeJson(kv, CHARGE_LIST_KEY, list);
    return true;
  } catch {
    return false;
  }
}

/** The list with this charge added, or its count raised by one. */
export function addCharge(list: readonly ChargeLine[], section: string): ChargeLine[] {
  return list.some((l) => l.section === section)
    ? list.map((l) => (l.section === section ? { ...l, count: clampCount(l.count + 1) } : l))
    : [...list, { section, count: 1 }];
}

/** The list with a new count for one charge (1 to 99). */
export function setCount(list: readonly ChargeLine[], section: string, count: number): ChargeLine[] {
  return list.map((l) => (l.section === section ? { ...l, count: clampCount(count) } : l));
}

/** Each line with its charge; lines whose charge isn't in the code are skipped. */
export function withCharges(list: readonly ChargeLine[], code: PenalCode = PENAL_CODE) {
  const bySection = new Map(code.charges.map((c) => [c.section, c]));
  return list.flatMap((l) => {
    const charge = bySection.get(l.section);
    return charge ? [{ ...l, charge }] : [];
  });
}

export function chargeTotals(list: readonly ChargeLine[], code: PenalCode = PENAL_CODE): ChargeTotals {
  const t: ChargeTotals = { jail: 0, min: 0, max: 0, fine: 0, counted: 0, discretion: [] };
  for (const { charge: c, count } of withCharges(list, code)) {
    t.fine += (c.fine || 0) * count;
    if (c.jail === undefined) {
      t.discretion.push(c);
      continue;
    }
    // The same range sentenceText shows: none when the code gives no upper bound.
    const ranged = c.min !== undefined && c.max !== undefined && c.max > 0;
    t.jail += c.jail * count;
    t.min += (ranged ? (c.min as number) : c.jail) * count;
    t.max += (ranged ? (c.max as number) : c.jail) * count;
    t.counted += count;
  }
  return t;
}

/** "45 months (range 35–57 months)", "No jail", or "" when no charge has set time. */
export function timeText(t: ChargeTotals): string {
  if (!t.counted) return "";
  const base = t.jail === 0 ? "No jail" : months(t.jail);
  return t.min === t.max ? base : base + " (range " + t.min.toLocaleString("en-GB") + "–" + months(t.max) + ")";
}

/** "$1,200", or "None". */
export function totalFineText(t: ChargeTotals): string {
  return t.fine ? "$" + t.fine.toLocaleString("en-GB") : "None";
}

/** "PC 2001 Murder (up to life)". */
export function discretionText(c: Charge): string {
  return chargeCitation(c) + (c.class === "Capital" ? " (up to life)" : "");
}

/** The plain-text summary that Copy gives, for a filing or Discord. */
export function chargeListText(list: readonly ChargeLine[], code: PenalCode = PENAL_CODE): string {
  const lines = withCharges(list, code);
  if (!lines.length) return "";
  const t = chargeTotals(list, code);
  const out = ["Charges:", ...lines.map((l) => l.count + " × " + chargeCitation(l.charge))];
  const time = timeText(t);
  if (time) out.push("Time: " + time);
  out.push("Fine: " + totalFineText(t));
  if (t.discretion.length) out.push("Judge's discretion: " + t.discretion.map(discretionText).join(", "));
  return out.join("\n");
}
