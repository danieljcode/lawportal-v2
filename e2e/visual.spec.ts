// Screenshot comparison tests (LP-117): the home screen and each program's main view, in the Modern and
// Classic layouts, light and dark, at desktop and phone widths (the playwright.config.ts projects).
// The approved screenshots are in e2e/screenshots/. They're taken in CI's Playwright Linux image, so
// fonts and anti-aliasing match; elsewhere these tests skip. `npm run screenshots:accept` copies the
// screenshots of the branch's last failed CI run over the approved ones (docs/testing.md).
import { expect, test } from "@playwright/test";
import { LAYOUTS, THEMES, VIEWS, openView } from "./views";

test.skip(process.platform !== "linux", "screenshots are compared in CI's Playwright Linux image");
// The phone's fractional pixel ratio (Pixel 7, 2.625) smooths text differently from run to run.
test.use({ deviceScaleFactor: 1 });

for (const layout of LAYOUTS) {
  for (const theme of THEMES) {
    for (const [view, url] of VIEWS) {
      test(`${view}, ${layout}, ${theme}`, async ({ page }, testInfo) => {
        await openView(page, url, layout, theme);
        await expect(page).toHaveScreenshot(`${testInfo.project.name}-${layout}-${theme}-${view}.png`);
      });
    }
  }
}
