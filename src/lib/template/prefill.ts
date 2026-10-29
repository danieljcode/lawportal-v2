// Prefills: today and date rules, values computed from other fields, and case-number patterns.

import { addDays } from "../deadlines";
import { gameTime } from "../gameTime";
import type { Field } from "../types";

/* ---------------------------------------------------------------- prefill */

/** The 2-digit game year of the real instant `now` ("90" in 2026). */
const gameYY = (now: Date) => gameTime(now).date.slice(2, 4);

/** `"today+21"` → `{base:"today", days:21}`; `"Filing date - 7"` → `{base:"Filing date", days:-7}`. */
export function dateRule(expr: string): { base: string; days: number } {
  const m = /^(.+?)\s*([+-])\s*(\d+)$/.exec(expr.trim());
  if (!m) return { base: expr.trim(), days: 0 };
  return { base: m[1].trim(), days: (m[2] === "-" ? -1 : 1) * Number(m[3]) };
}

export type Lookup = (label: string) => string | undefined;

/**
 * The value a field starts with ("" when none).
 * `now` is the real instant; dates and years come out on the game calendar (gameTime).
 * Text: a leading `YY` becomes the 2-digit game year; `<Label?A=x;B=y>` becomes the
 * code for another field's current value, and if that has no match the whole prefill is "".
 * Date: `today`, `today±N` or `<Label>±N` days, where today is the game date.
 */
export function prefillValue(f: Field, now?: Date, lookup?: Lookup): string {
  if (!f.prefill) return "";
  const when = now || new Date();
  if (f.type !== "date") {
    let missing = false;
    const out = f.prefill
      .replace(/^YY/, gameYY(when))
      .replace(/<([^?>]+)\?([^>]*)>/g, (_m, label: string, map: string) => {
        const current = lookup ? lookup(label.trim()) : undefined;
        const hit = map
          .split(";")
          .map((pair) => pair.split("="))
          .find((kv) => kv.length === 2 && kv[0].trim() === current);
        if (!hit) {
          missing = true;
          return "";
        }
        return hit[1].trim();
      });
    return missing ? "" : out;
  }
  const rule = dateRule(f.prefill);
  const base = rule.base === "today" ? gameTime(when).date : lookup ? lookup(rule.base) : undefined;
  return base ? addDays(base, rule.days) : "";
}

/**
 * The display pattern for a case-number field: 2-digit year + courthouse +
 * division + number (src/lib/courts.ts; port-forms writes the courthouse into
 * each form's prefill, e.g. `YYSCCR00XXX`). The `prefill` is expanded the same way
 * `prefillValue` does (`^YY` → 2-digit game year of the real instant `now`;
 * `<Label?A=x;B=y>` → the code for another field's current value)
 * but, unlike `prefillValue`, when the `<Division?…>` lookup misses it falls
 * back to the FIRST code listed in the token so the placeholder is never empty
 * (an un-chosen Division still shows a concrete `90SCCR00XXX`-style pattern).
 * Returns "" when the field has no prefill (callers skip those).
 */
export function caseNumberPattern(f: Field, now: Date | undefined, lookup?: Lookup): string {
  if (!f.prefill) return "";
  return f.prefill
    .replace(/^YY/, gameYY(now || new Date()))
    .replace(/<([^?>]+)\?([^>]*)>/g, (_m, label: string, map: string) => {
      const pairs = map
        .split(";")
        .map((pair) => pair.split("="))
        .filter((kv) => kv.length === 2);
      const current = lookup ? lookup(label.trim()) : undefined;
      const hit = pairs.find((kv) => kv[0].trim() === current);
      // Lookup miss → the first listed code, so the pattern stays concrete.
      return (hit ? hit[1] : pairs[0] ? pairs[0][1] : "").trim();
    });
}

/** Labels a field's prefill depends on, so it can be recomputed when they change. */
export function prefillDeps(f: Field): string[] {
  if (!f.prefill) return [];
  if (f.type === "date") {
    const base = dateRule(f.prefill).base;
    return base === "today" ? [] : [base];
  }
  const deps: string[] = [];
  for (const m of f.prefill.matchAll(/<([^?>]+)\?/g)) deps.push(m[1].trim());
  return deps;
}
