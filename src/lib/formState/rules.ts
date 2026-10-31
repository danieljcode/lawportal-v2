// Prefills, filling from the character, case-code swaps, Today/Auto, and opening a form.

import type { Contact } from "../contacts";
import { DIVISION_CODES } from "../dockets";
import { gameToday } from "../deadlines";
import { prefillValue } from "../template";
import type { Character, Entry, Field, Values } from "../types";
import { cloneValues, eachField, type FormState, labelsOf, type ScopePath, str } from "./state";
import { hasDependents, materializeBlocks, setValue } from "./update";

/* ------------------------------------------------------------ rules */

/**
 * Fill each prefilled field that is empty or still holds what was derived last
 * time; never overwrites user input. Up to 5 passes so chains (Judgement → schedule) settle.
 */
export function applyPrefills(entries: Entry[], s: FormState, now?: Date): FormState {
  const when = now || new Date();
  const values = cloneValues(s.values);
  const derived = { ...s.derived };
  let any = false;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    eachField(entries, values, (f, scope) => {
      if (!f.prefill) return;
      const current = scope[f.label];
      const ours = derived[f.label] !== undefined && derived[f.label] === current;
      if (current !== undefined && !ours) return;
      const v = prefillValue(f, when, (label) => str(scope[label]));
      if (v && v !== current) {
        scope[f.label] = v;
        derived[f.label] = v;
        changed = true;
      }
    });
    if (!changed) break;
    any = true;
  }
  return any ? { values, autofilled: s.autofilled, derived } : s;
}

/**
 * Fill `@character` fields from `char`. Without force only empty fields or ones
 * still holding the previous autofill change; a stale autofill the character lacks is removed.
 */
export function fillFromCharacter(entries: Entry[], s: FormState, char: Character | null, force: boolean): FormState {
  const values = cloneValues(s.values);
  const autofilled = { ...s.autofilled };
  let changed = false;
  eachField(entries, values, (f, scope) => {
    if (!f.character) return;
    const current = scope[f.label];
    const mine = autofilled[f.label] !== undefined && autofilled[f.label] === current;
    if (!force && current && !mine) return;
    const raw = char ? (char as unknown as Record<string, unknown>)[f.character] : undefined;
    const v = typeof raw === "string" ? raw : "";
    if (v) {
      if (current !== v || autofilled[f.label] !== v) changed = true;
      scope[f.label] = v;
      autofilled[f.label] = v;
    } else if (mine || force) {
      if (f.label in scope || f.label in autofilled) changed = true;
      delete scope[f.label];
      delete autofilled[f.label];
    }
  });
  return changed ? { values, autofilled, derived: s.derived } : s;
}

const PARTY_NAME = /\bname(\(s\))?$/i;

/** A party's name field (LP-30): typed text ending in "name", not one of the user's own character fields. */
export function isPartyName(f: Field): boolean {
  return f.type === "text" && !f.character && PARTY_NAME.test(f.label);
}

/**
 * Pick from Rolodex (LP-30): put the contact's name in `label`, and its address and phone in the
 * fields beside it, when the form has them ("Spouse 1 name" → "Spouse 1 address", "Spouse 1 phone").
 */
export function fillFromContact(entries: Entry[], s: FormState, path: ScopePath, label: string, c: Contact): FormState {
  const base = label.replace(PARTY_NAME, "");
  const have = labelsOf(entries, s.values);
  let next = setValue(s, path, label, c.name);
  for (const [field, v] of [
    [base + "address", c.address],
    [base + "phone", c.phone],
  ] as const) {
    if (v && have.has(field)) next = setValue(next, path, field, v);
  }
  return next;
}

/**
 * A hand-typed case number keeps its digits when the division changes; only the
 * code is swapped (90SCCR00147 → 90SCCC00147). A number that is still the derived value is left for applyPrefills.
 */
export function swapCaseCode(scope: Values, division: string, derivedCaseNumber: string | undefined): Values {
  const code = Object.keys(DIVISION_CODES).find((k) => DIVISION_CODES[k] === division);
  const current = str(scope["Case number"]);
  const m = /^(\d{2}[A-Z]{2})(CR|CC|TC|SM)(.+)$/i.exec(current || "");
  if (!code || !m || derivedCaseNumber === current) return scope;
  const next = m[1] + code + m[3];
  return next === current ? scope : { ...scope, "Case number": next };
}

/** R3: the date "Auto" button. Clears the value and its derived mark, then always re-applies prefills. */
export function autoDate(entries: Entry[], s: FormState, path: ScopePath, label: string, now?: Date): FormState {
  return applyPrefills(entries, setValue(s, path, label, ""), now);
}

/** R3: the date "Today" button (UTC). Prefills are re-applied only when other fields depend on this one. */
export function todayDate(entries: Entry[], s: FormState, path: ScopePath, label: string, now?: Date): FormState {
  const next = setValue(s, path, label, gameToday(now));
  return hasDependents(entries, next.values, label) ? applyPrefills(entries, next, now) : next;
}

/** R1: the state a form opens with: the draft (or empty), blocks materialised, prefills, then the non-force character fill. */
export function openState(entries: Entry[], draft: FormState | null, char: Character | null, now?: Date): FormState {
  const base = draft || { values: {}, autofilled: {}, derived: {} };
  const s: FormState = { ...base, values: materializeBlocks(entries, base.values) };
  return fillFromCharacter(entries, applyPrefills(entries, s, now), char, false);
}

/** R6: what FormView runs after addItem: materialise, prefill, then the non-force character fill. */
export function afterAddItem(entries: Entry[], s: FormState, char: Character | null, now?: Date): FormState {
  const values = materializeBlocks(entries, s.values);
  const m = values === s.values ? s : { ...s, values };
  return fillFromCharacter(entries, applyPrefills(entries, m, now), char, false);
}
