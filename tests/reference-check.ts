// Vitest global setup: says once, in the run's own output, whether the parity
// suites have their reference data (docs/templates-and-forms.md, Reference data). CI sets
// LAWAPP_REQUIRE_REFERENCE after checking the data out, so a gap fails the run. The same goes for
// the app's private data (LP-165): with only the sample, the real-data suites are left out.
import { existsSync } from "node:fs";
import path from "node:path";
import { REAL_DATA_TESTS, sampleData } from "./real-data";

const FILES = ["js_template.js", "js_bbcode.js", "js_forms.data.js"];

export default function setup(): void {
  if (sampleData()) {
    if (process.env.LAWAPP_REQUIRE_REFERENCE) {
      throw new Error("LAWAPP_REQUIRE_REFERENCE is set but src/data holds the sample data (scripts/app-data.mjs)");
    }
    console.warn(
      `\n[app-data] sample data: ${REAL_DATA_TESTS.length} suites that need the private forms are left out (tests/real-data.ts)\n`,
    );
  }
  const dir = path.resolve(process.cwd(), ".agents/reference/jsa");
  const missing = FILES.filter((f) => !existsSync(path.join(dir, f)));
  if (!missing.length) return;
  if (process.env.LAWAPP_REQUIRE_REFERENCE) {
    throw new Error("LAWAPP_REQUIRE_REFERENCE is set but .agents/reference/jsa/ is missing " + missing.join(", "));
  }
  console.warn(
    "\n[parity] skipped: reference data not found (missing " +
      missing.join(", ") +
      "; see docs/templates-and-forms.md, Reference data)\n",
  );
}
