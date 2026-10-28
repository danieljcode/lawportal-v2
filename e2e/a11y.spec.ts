// Accessibility check (LP-118): axe on the home screen and each program's main view, in the Modern and
// Classic layouts, light and dark, at desktop and phone widths. Serious and critical issues fail;
// minor and moderate ones are printed. The full manual review is LP-29.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { LAYOUTS, THEMES, VIEWS, openView } from "./views";

/** Known issues that don't fail the check yet: axe rule id → the Jira issue that fixes it. */
const ALLOWED: Record<string, string> = {};

for (const layout of LAYOUTS) {
  for (const theme of THEMES) {
    for (const [view, url] of VIEWS) {
      test(`${view}, ${layout}, ${theme}`, async ({ page }) => {
        await openView(page, url, layout, theme);
        const { violations } = await new AxeBuilder({ page }).analyze();
        const list = (vs: typeof violations) =>
          vs.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
        const failing = violations.filter((v) => (v.impact === "serious" || v.impact === "critical") && !ALLOWED[v.id]);
        const reported = violations.filter((v) => !failing.includes(v));
        if (reported.length) console.log(list(reported).join("\n"));
        expect(list(failing)).toEqual([]);
      });
    }
  }
}
