// The suites that test the real court forms and penal code by name (LP-165). That data is private,
// so a checkout without access to it (scripts/app-data.mjs wrote the sample) leaves these out:
// vitest.config.mts excludes them and tests/reference-check.ts says so. CI has the real data and
// runs them all. A new suite that needs a real form or charge goes here.
import { existsSync, readFileSync } from "node:fs";

export const REAL_DATA_TESTS = [
  "tests/court-wording.test.ts",
  "tests/crashScreen.test.tsx",
  "tests/deadlines.test.ts",
  "tests/deadlinesUi.test.tsx",
  "tests/dialogs.test.ts",
  "tests/discord.test.ts",
  "tests/discordPanel.test.ts",
  "tests/docketBar.test.tsx",
  "tests/docx.test.ts",
  "tests/draftHistoryUi.test.tsx",
  "tests/exhibitRefs.test.tsx",
  "tests/extra-forms.test.ts",
  "tests/filings.test.ts",
  "tests/filingsProgram.test.tsx",
  "tests/filingsUi.test.tsx",
  "tests/form-index.test.ts",
  "tests/formState.test.ts",
  "tests/formView.test.ts",
  "tests/jumpBox.test.tsx",
  "tests/keepPlace.test.tsx",
  "tests/layout.test.ts",
  "tests/libraryProgram.test.tsx",
  "tests/modernHome.test.tsx",
  "tests/modernShell.test.tsx",
  "tests/oneServer.test.tsx",
  "tests/penalCode.test.tsx",
  "tests/precedents.test.tsx",
  "tests/preview.test.ts",
  "tests/programs.test.tsx",
  "tests/required.test.ts",
  "tests/requiredDialog.test.tsx",
  "tests/template.parity.test.ts",
  "tests/template.test.ts",
];

/** Whether src/data holds the sample (no access to the private data). */
export function sampleData(): boolean {
  const marker = "src/data/.app-data";
  return existsSync(marker) && readFileSync(marker, "utf8").trim() === "sample";
}
