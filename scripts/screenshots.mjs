// Screenshots of the Win95 skin for the verify step (design §Testing, AC 23).
//
// Needs the app running (`npm start` or `npm run dev`) and a Playwright browser
// (`npx playwright install chromium`, or set PLAYWRIGHT_CHANNEL=msedge to use an
// installed Edge). Writes home, form, dialog and Discord-tab shots in light and dark to
// .agents/screenshots/{home,form,dialog,discord}-{light,dark}.png.
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
  { name: "form", hash: "#civil-complaint" },
  { name: "dialog", hash: "", open: "#open-characters" },
  { name: "discord", hash: "#civil-complaint", click: "#tab-discord" },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel });
try {
  for (const theme of ["light", "dark"]) {
    // A fresh context per theme: the theme is in localStorage before any page script runs.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem("lawapp_theme", t);
        localStorage.removeItem("lawapp_last_form");
      } catch {
        // storage blocked: the shot falls back to the system theme
      }
    }, theme);
    for (const shot of SHOTS) {
      // A new page per shot, so a form shot is a fresh page load with its hash (going from "/" to
      // "/#form" on one page would only be a same-document hash change).
      const page = await context.newPage();
      await page.goto(base + "/" + shot.hash, { waitUntil: "networkidle" });
      await page.waitForSelector(".app-window");
      if (shot.hash) {
        // No input is entered: the preview must hold the rendered template as soon as the form is there.
        const first = await page
          .waitForFunction(
            () => document.querySelector("#form-view") && { text: (document.querySelector("#preview")?.textContent || "").trim() },
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
