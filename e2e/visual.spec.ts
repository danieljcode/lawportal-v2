// Screenshot comparison tests (LP-117): the home screen and each program's main view, in the Modern and
// Classic layouts, light and dark, at desktop and phone widths (the playwright.config.ts projects).
// The approved screenshots are in e2e/screenshots/. They're taken in CI's Playwright Linux image, so
// fonts and anti-aliasing match; elsewhere these tests skip. `npm run screenshots:accept` copies the
// screenshots of the branch's last failed CI run over the approved ones (docs/testing.md).
import { expect, test } from "@playwright/test";

test.skip(process.platform !== "linux", "screenshots are compared in CI's Playwright Linux image");

/** The frozen moment: 19 October 2026, noon in New York (game date 1990). */
const NOW = new Date("2026-10-19T16:00:00Z");
const T = NOW.toISOString();

const CHARS = [{ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law", docket: true }];
const CASES = [
  {
    id: "case0001",
    caseNumber: "90SCCR00147",
    status: "Open",
    plaintiff: "People of San Andreas",
    defendant: "John Doe",
    lead: "alice001",
    assigned: [],
    created: T,
    updated: T,
    deadlines: [{ id: "dl000001", date: "1990-10-20", label: "Response due" }],
    exhibits: [],
  },
];

/** The home screen, then each program's start page (src/shell/registry.ts). */
const VIEWS = [
  ["home", "/"],
  ["filings", "/#filings"],
  ["cases", "/#cases"],
  ["clients", "/#clients/intake"],
  ["library", "/#library/penal-code"],
  ["jap", "/#jap"],
  ["settings", "/#control"],
] as const;

for (const layout of ["modern", "classic"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const [view, url] of VIEWS) {
      test(`${view}, ${layout}, ${theme}`, async ({ page }, testInfo) => {
        await page.clock.setFixedTime(NOW);
        await page.addInitScript(
          ({ layout, theme, chars, cases }) => {
            localStorage.setItem("lawapp_chars", JSON.stringify(chars));
            localStorage.setItem("lawapp_active_char", "alice001");
            localStorage.setItem("lawapp_cases", JSON.stringify(cases));
            localStorage.setItem("lawapp_theme", theme);
            localStorage.setItem("lawapp_shell", layout);
            localStorage.setItem("lawapp_changelog_seen", "x");
            sessionStorage.setItem("lawapp_booted", "1");
            // New ids come out the same every run.
            crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T) => {
              if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(7);
              return a;
            };
            // No idle preload of the other programs, so nothing loads mid-screenshot.
            window.requestIdleCallback = () => 0;
          },
          { layout, theme, chars: CHARS, cases: CASES },
        );
        await page.goto(url);
        await expect(page.locator(".m-app, .app-window, #home").first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${testInfo.project.name}-${layout}-${theme}-${view}.png`);
      });
    }
  }
}
