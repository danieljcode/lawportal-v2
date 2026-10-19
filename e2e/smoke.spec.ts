// End-to-end smoke tests (LP-6): the key journeys in a real browser, at desktop
// and phone widths (playwright.config.ts). Each test starts from empty storage.
import { expect, test, type Page } from "@playwright/test";

/** Open a form the way a user does: from the sidebar (behind ☰ on a phone). */
async function openForm(page: Page, id: string): Promise<void> {
  await page.goto("/");
  // The app renders in the browser after a brief "Loading…": wait for it before looking for ☰.
  await expect(page.locator(".app-window")).toBeVisible();
  const toggle = page.locator("#toggle-nav");
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`#sidebar a[href="#${id}"]`).click();
  await expect(page.locator("#form-view")).toBeVisible();
}

/** A judge (so the Dockets button shows), already saved and active. */
async function seedJudge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem("lawapp_chars")) return;
    localStorage.setItem("lawapp_chars", JSON.stringify([{ id: "e2ejudge1", name: "Judy Bench", title: "Judge" }]));
    localStorage.setItem("lawapp_active_char", "e2ejudge1");
  });
}

test("open a form, fill it in, and the preview follows", async ({ page }) => {
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

test("Copy for forum puts the filing on the clipboard as HTML", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openForm(page, "civil-complaint");
  await page.locator("#f-plaintiff-name").fill("Ann Lee");
  await page.locator("#copy-rich").click();
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
  await page.locator("#f-plaintiff-name").fill("Ann Lee");
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
  await page.goto("/");
  await page.locator("#open-characters").click();
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
  await page.locator("#open-dockets").click();
  await expect(page.locator("#dockets-title")).toContainText("Judy Bench");
  await page.locator("#new-docket").click();
  await page.locator("#docket-caseNumber").fill("90SCCR00147");
  await page.locator("#docket-plaintiff").fill("People");
  await page.locator("#docket-form button[type=submit]").click();
  await expect(page.locator("#docket-list")).toContainText("90SCCR00147");
});
