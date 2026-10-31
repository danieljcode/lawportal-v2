// Accessibility check (LP-118): axe on the home screen and each program's main view, in the Modern and
// Classic layouts, light and dark, at desktop and phone widths. Serious and critical issues fail;
// minor and moderate ones are printed. The full manual review is LP-29.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LAYOUTS, THEMES, VIEWS, openView } from "./views";

/** Known issues that don't fail the check yet: axe rule id → the Jira issue that fixes it. */
const ALLOWED: Record<string, string> = {};

async function check(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const list = (vs: typeof violations) =>
    vs.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
  const failing = violations.filter((v) => (v.impact === "serious" || v.impact === "critical") && !ALLOWED[v.id]);
  const reported = violations.filter((v) => !failing.includes(v));
  if (reported.length) console.log(list(reported).join("\n"));
  expect(list(failing)).toEqual([]);
}

for (const layout of LAYOUTS) {
  for (const theme of THEMES) {
    for (const [view, url] of VIEWS) {
      test(`${view}, ${layout}, ${theme}`, async ({ page }) => {
        await openView(page, url, layout, theme);
        await check(page);
      });
    }

    test(`date picker open, ${layout}, ${theme}`, async ({ page }) => {
      await openView(page, "/#cases/case0001", layout, theme);
      await page.locator(".game-date-open").first().click();
      await expect(page.locator(".game-date-pop")).toBeVisible();
      await check(page);
    });
  }
}

// 200% zoom (LP-29): a 1280×800 screen at 200% is a 640×400 viewport. Nothing scrolls sideways (WCAG
// reflow), the page itself or the bars across the top; the panes scroll up and down as they do anyway.
for (const layout of LAYOUTS) {
  for (const [view, url] of VIEWS) {
    test(`200% zoom, ${view}, ${layout}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "the phone size is narrower still");
      await page.setViewportSize({ width: 640, height: 400 });
      await openView(page, url, layout, "light");
      const wide = await page.evaluate(() =>
        [document.documentElement, ...document.querySelectorAll<HTMLElement>(".m-topbar, .classic-bar, .title-bar")]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => (el.className || el.tagName) + ": " + el.scrollWidth + " > " + el.clientWidth),
      );
      expect(wide).toEqual([]);
    });
  }
}
