// Keyboard only (LP-29): the key journeys with Tab, Enter, the arrow keys and Ctrl+K, never the mouse, in
// both layouts: switch programs, open a case, fill in and copy a filing, use the menus, change settings.
// Desktop only (a phone has no keyboard to speak of).
import { expect, test, type Page } from "@playwright/test";
import { LAYOUTS, openView } from "./views";

/** Tab forward until the focus is on `selector`, as a keyboard user would. */
async function tabTo(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached " + selector);
}

/** Ctrl+K, a few words, Enter: the jump box (LP-128). */
async function jump(page: Page, words: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(words);
  await page.keyboard.press("Enter");
}

for (const layout of LAYOUTS) {
  test(`keyboard only, ${layout}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "keyboard journeys are for the desktop");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openView(page, "/", layout, "light");

    // Switch programs from the home screen.
    await tabTo(page, layout === "modern" ? "#tile-cases" : "#pm-cases");
    await page.keyboard.press("Enter");
    // Classic's icon opens Upcoming while something is due, as it is here.
    await expect(page).toHaveURL(/#cases(\/upcoming)?$/);

    // Open a case.
    await tabTo(page, 'a[href="#cases/case0001"]');
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#cases\/case0001$/);

    // Fill in a filing and copy it for the forum.
    await jump(page, "civil complaint");
    await expect(page.locator("#form-view")).toBeVisible();
    await tabTo(page, "#f-plaintiff-name");
    await page.keyboard.type("Ann Lee");
    await expect(page.locator("#preview")).toContainText("Ann Lee");
    await tabTo(page, "#copy-rich");
    await page.keyboard.press("Enter");
    await tabTo(page, "#missing-anyway");
    await page.keyboard.press("Enter");
    await expect(page.locator("#copy-status")).toContainText("Copied");

    // The menus: Help → Contents.
    await tabTo(page, "#menu-help");
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu-help-contents")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#help$/);

    // Change a setting: light to dark.
    await jump(page, layout === "modern" ? "settings" : "control panel");
    await expect(page).toHaveURL(/#control$/);
    await tabTo(page, "#control-theme");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
}
