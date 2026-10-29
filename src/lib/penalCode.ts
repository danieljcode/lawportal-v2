// The penal code in the Law Library (LP-17). The charges live in
// one data file, src/data/penal-code.json, written by `npm run penal-code`
// from the server's sheet (see scripts/import-penal-code.mjs); it records the
// date it was last updated. Search, the sentencing text and the citation
// ("PC 1001 Assault") are pure functions here.

import data from "@/data/penal-code.json";
import { searchTerms } from "./precedents";

export const CHARGE_CLASSES = ["Capital", "Felony", "Misdemeanor", "Infraction"] as const;
export type ChargeClass = (typeof CHARGE_CLASSES)[number];
export type ChargeStatus = "new" | "amended" | "review" | "retired" | "unchanged";

export interface Charge {
  /** "PC 1001". */
  section: string;
  chapter: string;
  title: string;
  class: ChargeClass;
  /** Default jail in months; absent when the judge decides (see min/max). */
  jail?: number;
  /** The range, or the judge's guidance range when there's no default. */
  min?: number;
  max?: number;
  /** Dollars. */
  fine?: number;
  description: string;
  /** Seizures and the like: "Weapon seized". */
  penalties?: string;
  /** Where the charge stands in the server's current revision. */
  status: ChargeStatus;
}

export interface PenalCode {
  title: string;
  /** Said alongside it, e.g. that it's a draft. */
  note?: string;
  source: string;
  /** When the data file was last brought up to date (real date), YYYY-MM-DD. */
  updated: string;
  charges: Charge[];
}

export const PENAL_CODE = data as PenalCode;

/** The chapters, in the code's order. */
export function chapters(code: PenalCode = PENAL_CODE): string[] {
  return [...new Set(code.charges.map((c) => c.chapter))];
}

/** A chapter's address part: "Offenses Involving Theft" → "offenses-involving-theft" (LP-108). */
export function chapterSlug(chapter: string): string {
  return chapter
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The chapter with this slug, or "" for none or an unknown one. */
export function chapterFromSlug(slug: string | undefined, code: PenalCode = PENAL_CODE): string {
  if (!slug) return "";
  return chapters(code).find((c) => chapterSlug(c) === slug) || "";
}

export type ChargeSort = "section" | "title";

/** Charges in section order (as the code lists them) or by title, A to Z. */
export function sortCharges(charges: readonly Charge[], by: ChargeSort): Charge[] {
  if (by === "section") return [...charges];
  return [...charges].sort((a, b) => a.title.localeCompare(b.title, "en-GB") || a.section.localeCompare(b.section));
}

/** "PC 1001 Assault". */
export function chargeCitation(c: Charge): string {
  return c.section + " " + c.title;
}

const months = (n: number) => n.toLocaleString("en-GB") + (n === 1 ? " month" : " months");

/** The sentence in words: the default and range, or the judge's guidance. */
export function sentenceText(c: Charge): string {
  if (c.jail !== undefined) {
    const base = c.jail === 0 ? "No jail" : months(c.jail);
    return c.min !== undefined && c.max !== undefined && c.max > 0
      ? base + " (range " + c.min.toLocaleString("en-GB") + "–" + months(c.max) + ")"
      : base;
  }
  if (c.min !== undefined && c.max !== undefined) {
    return "Judge's discretion: " + c.min.toLocaleString("en-GB") + "–" + months(c.max);
  }
  if (c.min !== undefined) {
    return "Judge's discretion: " + months(c.min) + " or more" + (c.class === "Capital" ? ", up to life" : "");
  }
  return "See the description";
}

/** "$1,200", or "" for no fine. */
export function fineText(c: Charge): string {
  return c.fine ? "$" + c.fine.toLocaleString("en-GB") : "";
}

export interface ChargeFilter {
  q?: string;
  chapter?: string;
  class?: string;
  /** Retired charges are left out unless asked for. */
  retired?: boolean;
}

const sectionDigits = (c: Charge) => c.section.replace(/\D/g, "");

/**
 * Charges matching every search word (in the section number, title, description, penalties or
 * chapter), filtered by chapter and class. A section number typed on its own ("1001" or
 * "PC 1001") puts that charge first, then title matches, then the rest, in code order.
 */
export function searchCharges(charges: readonly Charge[], f: ChargeFilter): Charge[] {
  const terms = searchTerms(f.q || "");
  const asNumber = (f.q || "").replace(/^\s*pc\s*/i, "").trim();
  const exact = /^\d+$/.test(asNumber) ? asNumber : "";
  const scored: Array<{ c: Charge; score: number; i: number }> = [];
  charges.forEach((c, i) => {
    if (c.status === "retired" && !f.retired && sectionDigits(c) !== exact) return;
    if (f.chapter && c.chapter !== f.chapter) return;
    if (f.class && c.class !== f.class) return;
    if (exact && sectionDigits(c) === exact) {
      scored.push({ c, score: 0, i });
      return;
    }
    const words = terms.filter((t) => t !== "pc");
    const title = c.title.toLowerCase();
    const hay = [c.section, c.title, c.description, c.penalties || "", c.chapter].join("\n").toLowerCase();
    if (!words.every((t) => hay.includes(t))) return;
    scored.push({ c, score: words.length && words.every((t) => title.includes(t)) ? 1 : 2, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((s) => s.c);
}
