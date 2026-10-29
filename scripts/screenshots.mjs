// Screenshots of the app, for checking a change by eye and for the README (docs/screenshots/).
//
// Needs the app running (`npm start` or `npm run dev`) and a Playwright browser
// (`npx playwright install chromium`, or set PLAYWRIGHT_CHANNEL=msedge to use an
// installed Edge). Writes home, form, settings, Discord-tab and Classic home shots in light and
// dark, with one character and one case, to .agents/screenshots/<shot>-<theme>.png.
//
// Usage: node scripts/screenshots.mjs [baseUrl]   (default http://127.0.0.1:3000)
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".agents", "screenshots");
const base = (process.argv[2] || process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

const SHOTS = [
  { name: "home", hash: "" },
  { name: "form", hash: "#filings/civil-complaint", form: true },
  { name: "settings", hash: "#control" },
  { name: "discord", hash: "#filings/civil-complaint", form: true, click: "#tab-discord" },
  { name: "classic-home", hash: "", classic: true },
];

const CHARS = [{ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" }];
const CASES = [
  {
    id: "case0001",
    caseNumber: "90SCCR00147",
    status: "Open",
    plaintiff: "People of San Andreas",
    defendant: "John Doe",
    lead: "alice001",
    assigned: [],
    created: "2026-10-28T12:00:00.000Z",
    updated: "2026-10-28T12:00:00.000Z",
    deadlines: [],
    exhibits: [],
  },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel });
try {
  for (const theme of ["light", "dark"]) {
    // A fresh context per theme: the theme is in localStorage before any page script runs.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(
      ({ t, chars, cases }) => {
        try {
          localStorage.setItem("lawapp_theme", t);
          localStorage.setItem("lawapp_chars", JSON.stringify(chars));
          localStorage.setItem("lawapp_active_char", "alice001");
          localStorage.setItem("lawapp_cases", JSON.stringify(cases));
          localStorage.removeItem("lawapp_last_form");
        } catch {
          // storage blocked: the shot falls back to the system theme
        }
      },
      { t: theme, chars: CHARS, cases: CASES },
    );
    for (const shot of SHOTS) {
      // A new page per shot, so a form shot is a fresh page load with its hash (going from "/" to
      // "/#form" on one page would only be a same-document hash change).
      const page = await context.newPage();
      // Classic for this page only, without its once-a-session startup screen.
      if (shot.classic)
        await page.addInitScript(() => {
          localStorage.setItem("lawapp_shell", "classic");
          sessionStorage.setItem("lawapp_booted", "1");
        });
      else await page.addInitScript(() => localStorage.removeItem("lawapp_shell"));
      await page.goto(base + "/" + shot.hash, { waitUntil: "networkidle" });
      await page.waitForSelector(".m-app, .app-window");
      if (shot.form) {
        // No input is entered: the preview must hold the rendered template as soon as the form is there.
        const first = await page
          .waitForFunction(
            () =>
              document.querySelector("#form-view") && {
                text: (document.querySelector("#preview")?.textContent || "").trim(),
              },
            null,
            { polling: 10 },
          )
          .then((h) => h.jsonValue());
        if (!first.text) throw new Error(`${theme} ${shot.name}: #preview empty when the form appeared`);
      }
      if (shot.open) {
        await page.click(shot.open);
        await page.waitForSelector("dialog[open]");
      }
      if (shot.click) {
        await page.click(shot.click);
        await page.waitForSelector(".dc-part");
      }
      const file = path.join(outDir, `${shot.name}-${theme}.png`);
      await page.screenshot({ path: file });
      console.log("wrote", path.relative(root, file));
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
