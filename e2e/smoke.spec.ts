// End-to-end smoke tests (LP-6): the key journeys in a real browser, at desktop
// and phone widths (playwright.config.ts). Each test starts from empty storage.
// Each program's own journey starts from the home screen, in both layouts (LP-111).
import { expect, test, type Page } from "@playwright/test";
import { LAYOUTS } from "./views";

/** Open a program the way a user does: its tile on the Modern home, its icon in Classic's Program Manager. */
async function openFromHome(page: Page, id: string): Promise<void> {
  await page.goto("/");
  // The app renders in the browser after a brief "Loading…": wait for the home screen (LP-127).
  await page.locator(`#tile-${id}, #pm-${id}`).click();
  await expect(page.locator(".m-app, .app-window").first()).toBeVisible();
}

/** Open a form: Court Filings from the home screen, then the sidebar (behind ☰ on a phone). */
async function openForm(page: Page, id: string): Promise<void> {
  await openFromHome(page, "filings");
  const toggle = page.locator("#toggle-nav");
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`#sidebar a[href="#filings/${id}"]`).click();
  await expect(page.locator("#form-view")).toBeVisible();
}

/** A judge (so the Dockets button shows), already saved and active. */
async function seedJudge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Seed once: after the first load the data has moved to IndexedDB (LP-36).
    if (localStorage.getItem("lawapp_chars") || localStorage.getItem("lawapp_idb")) return;
    localStorage.setItem("lawapp_chars", JSON.stringify([{ id: "e2ejudge1", name: "Judy Bench", title: "Judge" }]));
    localStorage.setItem("lawapp_active_char", "e2ejudge1");
  });
}

// The Content-Security-Policy (LP-169): no journey trips it. Chromium reports each blocked
// script, style or request on the console.
let cspErrors: string[] = [];
test.beforeEach(({ page }) => {
  cspErrors = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
  });
});
test.afterEach(() => expect(cspErrors).toEqual([]));

test("pages are sent with a Content-Security-Policy that trusts only this request's scripts", async ({ page }) => {
  const response = await page.goto("/");
  const csp = response!.headers()["content-security-policy"];
  const scriptSrc = /script-src ([^;]+)/.exec(csp)![1];
  expect(scriptSrc).toMatch(/'nonce-[^']+'/);
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  const nonce = /'nonce-([^']+)'/.exec(scriptSrc)![1];
  // Every script in the page as sent carries it (the theme and title scripts too). Those added
  // later by a trusted script ('strict-dynamic') don't need it.
  const tags = (await response!.text()).match(/<script\b[^>]*>/g) || [];
  expect(tags.length).toBeGreaterThan(0);
  expect(tags.filter((t) => !t.includes(`nonce="${nonce}"`))).toEqual([]);
});

for (const layout of LAYOUTS) {
  test.describe(`${layout} layout`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((layout) => {
        localStorage.setItem("lawapp_shell", layout);
        // Classic's startup screen shows once per session; skip it.
        sessionStorage.setItem("lawapp_booted", "1");
      }, layout);
    });

    test("Court Filings: open a form, fill it in, and the preview follows", async ({ page }) => {
      await openForm(page, "civil-complaint");
      const preview = page.locator("#preview");
      await expect(preview).toContainText("SAN ANDREAS COURT");
      await page.locator("#f-plaintiff-name").fill("Ann Lee");
      await page.locator("#f-defendant-name").fill("Bo Day");
      await expect(preview).toContainText("Ann Lee");
      await expect(preview).toContainText("Bo Day");
      // The case number placeholder is the in-game SC pattern.
      await expect(page.locator("#f-case-number")).toHaveAttribute("placeholder", /^\d{2}SCCC00XXX$/);
    });

    test("Case File: add a case, find it, and open it", async ({ page }, testInfo) => {
      await seedJudge(page);
      await openFromHome(page, "cases");
      await expect(page.locator("#case-file-title")).toHaveText("Case File");
      await page.locator("#case-new").click();
      await page.locator("#case-caseNumber").fill("90SCCR00321");
      await page.locator("#case-plaintiff").fill("Ann Lee");
      await page.locator("#case-lead").selectOption("e2ejudge1");
      await page.locator("#case-save").click();
      await expect(page).toHaveURL(/#cases\/[a-z0-9]+$/);
      await expect(page.locator("#case-form-title")).toHaveText("90SCCR00321");

      // Back to the list (on a phone the case replaces it), then search for it.
      if (testInfo.project.name === "phone") {
        await expect(page.locator("#case-list")).toBeHidden();
        await page.locator(".case-back").click();
      } else {
        await page.goto("/#cases");
      }
      await page.locator("#case-search").fill("ann");
      await expect(page.locator(".case-row")).toHaveCount(1);
      await expect(page.locator(".case-row")).toContainText("Lead: Judy Bench");
    });

    test("Clients: a new client's intake opens a case", async ({ page }) => {
      await seedJudge(page);
      await openFromHome(page, "clients");
      await expect(page.locator("#intake-title")).toHaveText("New client intake");
      await page.locator("#intake-clientName").fill("Ann Lee");
      await page.locator("#intake-summary").fill("Wants to sue her landlord.");
      await page.locator("#intake-open").click();
      // The case gets a stand-in number until the court gives it one.
      await expect(page).toHaveURL(/#cases\/[a-z0-9]+$/);
      await expect(page.locator("#case-form-title")).toHaveText("PENDING-1");
    });

    test("Law Library: search the penal code", async ({ page }) => {
      await openFromHome(page, "library");
      await page.locator("#code-q").fill("assault");
      await expect(page.locator("#code-list")).toContainText("PC 1001");
      await page.locator("#code-q").fill("no such charge at all");
      await expect(page.locator("#code-none")).toBeVisible();
    });

    test("Settings: switch to the dark theme", async ({ page }) => {
      await openFromHome(page, "control");
      await page.locator("#control-theme").selectOption("dark");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("html")).toHaveAttribute("data-look", layout);
    });
  });
}

test("Copy for forum puts the filing on the clipboard as HTML", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openForm(page, "civil-complaint");
  await page.locator("#f-plaintiff-name").fill("Ann Lee");
  // The defendant and case number are still empty (LP-87): the copy asks first.
  await page.locator("#copy-rich").click();
  await expect(page.locator("#missing-list")).toContainText("Defendant name");
  await page.locator("#missing-anyway").click();
  await expect(page.locator("#copy-status")).toContainText("Copied");
  const html = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType("text/html")).text();
  });
  expect(html).toContain("Ann Lee");
  expect(html).toContain("SAN ANDREAS COURT");
});

test("Download .docx gives a Word file", async ({ page }) => {
  await openForm(page, "civil-complaint");
  // Every required field filled, so it downloads without asking (LP-87).
  await page.locator("#f-plaintiff-name").fill("Ann Lee");
  await page.locator("#f-defendant-name").fill("Bo Day");
  await page.locator("#f-case-number").fill("90SCCC00123");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download-docx").click()]);
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const file = Buffer.concat(chunks);
  expect(file.subarray(0, 2).toString()).toBe("PK"); // a .docx is a zip
  expect(file.length).toBeGreaterThan(1000);
});

test("add a character, and it becomes the one filing", async ({ page }) => {
  // Characters are a section of Settings (LP-109).
  await page.goto("/#control");
  await page.locator("#new-character").click();
  await page.locator("#char-name").fill("Casey Counsel");
  await page.locator("#char-title").fill("Attorney at Law");
  await page.locator("#char-form button[type=submit]").click();
  await expect(page.locator("#char-list")).toContainText("Casey Counsel");
  await expect(page.locator("#active-character option", { hasText: "Casey Counsel" })).toHaveCount(1);
});

test("add a case to a judge's docket", async ({ page }) => {
  await seedJudge(page);
  await page.goto("/");
  // A phone's top bar keeps Dockets in the File menu (LP-125).
  const dockets = page.locator("#open-dockets");
  if (await dockets.isVisible()) await dockets.click();
  else {
    await page.locator("#menu-file").click();
    await page.locator("#menu-dockets").click();
  }
  await expect(page.locator("#dockets-title")).toContainText("Judy Bench");
  await page.locator("#new-docket").click();
  await page.locator("#docket-caseNumber").fill("90SCCR00147");
  await page.locator("#docket-plaintiff").fill("People");
  await page.locator("#docket-form button[type=submit]").click();
  await expect(page.locator("#docket-list")).toContainText("90SCCR00147");
});

test("Ctrl+K jumps to a form, and Esc closes the box and gives the focus back", async ({ page }) => {
  await page.goto("/#cases");
  await expect(page.locator("#case-file-title")).toHaveText("Case File");
  const rail = page.locator("#rail-cases");
  await rail.focus();

  // "/" opens it (not typing in a field); Esc closes it, back where the focus was (LP-128).
  await page.keyboard.press("/");
  await expect(page.locator("#jump-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#jump-box")).toBeHidden();
  await expect(rail).toBeFocused();

  await page.keyboard.press("Control+k");
  await expect(page.locator("#jump-input")).toBeFocused();
  await page.keyboard.type("civil compl");
  await expect(page.locator("#jump-results [aria-selected=true]")).toContainText("Civil Complaint");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#filings\/civil-complaint$/);
  await expect(page.locator("#form-view")).toBeVisible();
});

/** The first-load JavaScript budget for the home screen, uncompressed (README, "First-load budget"; LP-122, LP-133). */
const FIRST_LOAD_BUDGET_KIB = 650;

test("the home screen's first load stays within the JavaScript budget", async ({ page }) => {
  // First load only: the idle preload of the programs never fires.
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
  });
  const sizes: Promise<number>[] = [];
  page.on("response", (r) => {
    if (/\.js(\?|$)/.test(r.url())) sizes.push(r.body().then((b) => b.length));
  });
  await page.goto("/");
  await expect(page.locator("#home")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const kib = (await Promise.all(sizes)).reduce((a, b) => a + b, 0) / 1024;
  expect(kib, `first-load JavaScript is ${kib.toFixed(0)} KiB`).toBeLessThanOrEqual(FIRST_LOAD_BUDGET_KIB);
});
