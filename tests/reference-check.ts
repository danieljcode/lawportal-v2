// Vitest global setup: says once, in the run's own output, whether the parity
// suites have their reference data (docs/templates-and-forms.md, Reference data). CI sets
// LAWAPP_REQUIRE_REFERENCE after checking the data out, so a gap fails the run.
import { existsSync } from "node:fs";
import path from "node:path";

const FILES = ["js_template.js", "js_bbcode.js", "js_forms.data.js"];

export default function setup(): void {
  const dir = path.resolve(process.cwd(), ".agents/reference/jsa");
  const missing = FILES.filter((f) => !existsSync(path.join(dir, f)));
  if (!missing.length) return;
  if (process.env.LAWAPP_REQUIRE_REFERENCE) {
    throw new Error("LAWAPP_REQUIRE_REFERENCE is set but .agents/reference/jsa/ is missing " + missing.join(", "));
  }
  console.warn("\n[parity] skipped: reference data not found (missing " + missing.join(", ") + "; see docs/templates-and-forms.md, Reference data)\n");
}
