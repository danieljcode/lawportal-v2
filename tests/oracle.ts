// Test-only access to the reference client (.agents/reference/jsa; CI checks it out from a private repo), used as a
// behavioural oracle by the differential suites. Never imported from src/.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Entry shape shared by both engines' `fields()` output (the reference's cond is a block node with `cond:true`). */
export interface RefNode {
  kind: string;
  name?: string;
  count?: number;
  on?: boolean;
  cond?: boolean;
  children?: RefNode[];
}
export interface RefField {
  label: string;
  type: string;
  options: string[];
  fallback: string;
  prefill?: string;
  character?: string;
  wrap?: string;
  line: number;
  text?: string;
  indent?: boolean;
}
export type RefEntry =
  | { section: string }
  | { field: RefField }
  | { block: RefNode; fields: RefEntry[] }
  | { cond: RefNode; fields: RefEntry[] };

export interface RefTemplate {
  compile(src: string): RefNode;
  fields(tree: RefNode): RefEntry[];
  render(tree: RefNode, values: unknown, opts?: { highlight?: boolean }): string;
  formatDate(value: string, fmt?: string): string;
  prefillValue(f: RefField, now?: Date, lookup?: (label: string) => string | undefined): string;
}

// vitest runs from the repo root. See README "Reference data" for where the files come from.
const dir = path.resolve(process.cwd(), ".agents/reference/jsa");

export const hasOracle = existsSync(path.join(dir, "js_template.js")) && existsSync(path.join(dir, "js_bbcode.js"));

/** The reference forms (template-safety compares forms.json against them). */
export const REF_FORMS = path.join(dir, "js_forms.data.js");
export const hasRefForms = existsSync(REF_FORMS);

// tests/reference-check.ts prints this once per run, and fails it under LAWAPP_REQUIRE_REFERENCE.
export const SKIP_NOTE = "skipped: reference data not found (see README, Reference data)";

/** A parity suite's name, with the skip note added when the reference data is missing. */
export function paritySuite(name: string, available = hasOracle): string {
  return available ? name : name + " (" + SKIP_NOTE + ")";
}

// js_template.js is UMD: `module.exports = factory()` under CommonJS.
export const refTemplate: RefTemplate | null = hasOracle
  ? (createRequire(import.meta.url)(path.join(dir, "js_template.js")) as RefTemplate)
  : null;

/** js_bbcode.js attaches to `self.BBCode`; evaluate it in the jsdom global (jsdom-environment files only). */
export function loadRefBBCode(): { fromHtml(html: string): string } {
  new Function("self", readFileSync(path.join(dir, "js_bbcode.js"), "utf8"))(globalThis);
  return (globalThis as unknown as { BBCode: { fromHtml(html: string): string } }).BBCode;
}
