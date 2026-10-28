// Types and shared constants for HTML → Discord markdown.

import type { HtmlParser } from "../bbcode";

export type TablesMode = "code" | "lines";
export type Mark = "b" | "i" | "u" | "s" | "spoiler";

export const MARKERS: Record<Mark, string> = { b: "**", i: "*", u: "__", s: "~~", spoiler: "||" };

/** The horizontal rule, used for `<hr>` and the edges of bordered boxes. */
export const RULE = "─".repeat(20);

/** text is final markdown: escaped for plain text runs, raw for atoms (links, image URLs, inline code). */
export interface Run {
  text: string;
  marks: Mark[];
  atom?: boolean;
  px?: number;
}

export type DLine =
  | { kind: "text"; prefix: string; runs: Run[] }
  | { kind: "blank" }
  | { kind: "rule" }
  | { kind: "code"; lang: string; lines: string[] };

export interface DiscordDoc {
  lines: DLine[];
}

export interface DiscordOptions {
  /** How grid tables (the court caption) are rendered. Default "code". */
  tables?: TablesMode;
  parser?: HtmlParser;
}

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const URL_RE = /^https?:\/\/[^\s<>"]+$/i;
/** Widest code-block column; longer cell lines wrap. */
export const COL_MAX = 40;
/** A table cell with more plain text than this can't live in a fixed-width column. */
export const GRID_CELL_MAX = 400;
/** Longest line (in markdown chars) that still becomes a `#`/`##`/`###` heading. */
export const HEADING_MAX = 100;
export const FENCE = "```";
export const SAFE_FENCE = "ˋˋˋ";
