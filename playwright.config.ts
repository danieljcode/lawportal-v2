// End-to-end smoke tests (LP-6): a real browser through the key journeys, at
// desktop and phone widths. `npm run test:e2e` builds nothing itself: run
// `npm run build` first (CI does), then it starts `next start` on port 3210 and
// stops it afterwards. A failing test keeps its screenshot and trace in
// test-results/ (CI uploads them).
import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
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
    command: `npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // A throwaway sync directory, so the tests never touch real sync data.
    env: { LAWAPP_SYNC_DIR: "test-results/sync" },
  },
});
