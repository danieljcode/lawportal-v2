// Fixture rule (DES §Testing), shared by the parity, BBCode, docx and Discord suites.
// Built from a `fields()` list, so it works with either engine's entries.
import type { Values } from "@/lib/types";

export const TEXT_VALUE = 'X<&>"1\n\nX2';

/** Markdown-looking user text: none of it may format in Discord output. */
export const MD_TEXT = "a*b_c~d|e`f\\g # > [x](https://e.com) @here <@1>";

const WORDS = [
  "the",
  "court",
  "finds",
  "that",
  "plaintiff",
  "filed",
  "a",
  "timely",
  "motion",
  "and",
  "defendant",
  "did",
  "not",
  "respond",
  "within",
  "fourteen",
  "days",
  "of",
  "service",
  "under",
  "rule",
];

/** ≈ 2,600 chars of sentence-structured text with markdown-looking pieces mixed in. */
export const LONG_TEXT: string = (() => {
  const ends = [".", "?", "!"];
  const extras = ["*bold?*", "_x_", "~~y~~", "||z||", "`c`", "#", ">", "-", "1.", "@everyone", "<@1>"];
  const out: string[] = [];
  for (let s = 0; s < 120; s++) {
    const words: string[] = [];
    const n = 3 + (s % 4);
    for (let w = 0; w < n; w++) words.push(WORDS[(s * 7 + w * 3) % WORDS.length]);
    if (s % 10 === 3) words.splice(1, 0, extras[((s / 10) | 0) % extras.length]);
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    out.push(words.join(" ") + ends[s % 3]);
  }
  out.splice(60, 0, "\nhttps://example.com/a_b/(c)\n");
  return out.join(" ");
})();

interface FixtureField {
  label: string;
  type: string;
  options: string[];
  character?: string;
}
type FixtureEntry =
  | { section: string }
  | { field: FixtureField }
  | { block: { name?: string }; fields: FixtureEntry[] }
  | { cond: { name?: string }; fields: FixtureEntry[] };

export type Variant = "A" | "B";

export interface FixtureOptions {
  /** Replaces TEXT_VALUE for text-like fields. */
  text?: string;
  /** Items per repeating block (default 3). */
  items?: number;
}

function fieldValue(f: FixtureField, variant: Variant, opts: FixtureOptions): string | boolean {
  switch (f.type) {
    case "number":
      return "7";
    case "date":
      return "2026-01-02";
    case "url":
    case "image":
      return "https://example.com/a.png";
    case "select":
      return f.options[0] ?? "";
    case "check":
      return variant === "A";
    default:
      // text, textarea, list, paras, spoiler
      return opts.text ?? TEXT_VALUE;
  }
}

function fill(entries: FixtureEntry[], variant: Variant, opts: FixtureOptions, into: Values): Values {
  for (const e of entries) {
    if ("field" in e) {
      // The exhibit list (LP-13) comes from the case, never a typed value: left empty, both
      // engines show its fallback.
      if (e.field.character === "exhibits") continue;
      into[e.field.label] = fieldValue(e.field, variant, opts);
    } else if ("cond" in e) {
      into["?" + e.cond.name] = variant === "A";
      fill(e.fields, variant, opts, into); // conds share their parent's scope
    } else if ("block" in e) {
      into["#" + e.block.name] = Array.from({ length: opts.items ?? 3 }, () => fill(e.fields, variant, opts, {}));
    }
  }
  return into;
}

/**
 * Fixture A: every field filled, every check and cond true, every block 3 items.
 * Fixture B: the same, with every check and cond false.
 * `opts` swaps the text value and the block item count (the Discord splitter's long fixture).
 */
export function fixture(entries: readonly unknown[], variant: Variant, opts: FixtureOptions = {}): Values {
  return fill(entries as FixtureEntry[], variant, opts, {});
}
