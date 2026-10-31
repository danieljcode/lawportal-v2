// The screens the screenshot (LP-117) and accessibility (LP-118) tests visit, each opened the same way:
// a frozen clock, fixed ids, and storage seeded with one character and one case.
import { expect, type Page } from "@playwright/test";

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

export const LAYOUTS = ["modern", "classic"] as const;
export const THEMES = ["light", "dark"] as const;

/** The home screen, then each program's start page (src/shell/registry.ts). */
export const VIEWS = [
  ["home", "/"],
  ["filings", "/#filings"],
  ["cases", "/#cases"],
  ["clients", "/#clients/intake"],
  ["library", "/#library/penal-code"],
  ["ledger", "/#ledger"],
  ["jap", "/#jap"],
  ["settings", "/#control"],
] as const;

/** Open `url` in the given layout and theme, and wait until it has settled. */
export async function openView(
  page: Page,
  url: string,
  layout: (typeof LAYOUTS)[number],
  theme: (typeof THEMES)[number],
): Promise<void> {
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
      // No idle preload of the other programs, so nothing loads mid-test.
      window.requestIdleCallback = () => 0;
    },
    { layout, theme, chars: CHARS, cases: CASES },
  );
  await page.goto(url);
  await expect(page.locator(".m-app, .app-window, #home").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}
