// Start-up data migrations (LP-2). AppLoader runs these once App's code has
// loaded and before it first renders, so they never run during render. Each is
// a no-op once done. Until they've run, stores still read old data correctly:
// reads upgrade in memory without writing.

import { characterStore } from "./characters";
import { caseStore } from "./cases";
import { portfolioStore } from "./portfolio";

/** Each store's migrate(), in turn (LP-2, LP-99). */
const STORES: Array<[string, () => { migrate(): boolean }]> = [
  ["characters", characterStore],
  // Cases before anything else reads dockets: the old per-character dockets become cases (LP-4).
  ["cases", caseStore],
  ["J.A.P. portfolios", portfolioStore],
];

export function runMigrations(): void {
  for (const [name, store] of STORES) {
    try {
      store().migrate();
    } catch (err) {
      // Storage refused the write: reads still upgrade in memory, so try again next load.
      console.warn("[migrations] couldn't save the upgraded " + name, err);
    }
  }
  try {
    characterStore().migrateServerField();
  } catch (err) {
    // The field is ignored anyway, so try again next load (LP-71).
    console.warn("[characters] couldn't drop the old server field", err);
  }
}
