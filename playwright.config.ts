// End-to-end smoke tests (LP-6): a real browser through the key journeys, at
// desktop and phone widths. `npm run test:e2e` starts `next start` on port 3210
// and stops it afterwards. Locally it runs `npm run build` first, so the tests
// never run an old build (LP-134); CI builds in its own step, so it only starts.
// A failing test keeps its screenshot and trace in test-results/ (CI uploads them).
import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const START = `npx next start -H 127.0.0.1 -p ${PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // e2e/visual.spec.ts (LP-117): one flat folder, named by project, layout, theme and view. No platform
  // suffix, as only CI's Linux image compares.
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  fullyParallel: true,
  // CI's runner has 2 cores, where Playwright's default is 1 worker; 2 keep the axe check (LP-118) quick.
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.CI ? START : `npm run build && ${START}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Room for the local build.
    timeout: process.env.CI ? 60_000 : 300_000,
    // A throwaway sync directory, so the tests never touch real sync data.
    env: { LAWAPP_SYNC_DIR: "test-results/sync" },
  },
});
