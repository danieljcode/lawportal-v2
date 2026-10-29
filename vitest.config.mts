import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { REAL_DATA_TESTS, sampleData } from "./tests/real-data";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Without the private data, the suites that test the real forms are left out (LP-165).
    exclude: ["**/node_modules/**", ...(sampleData() ? REAL_DATA_TESTS : [])],
    globalSetup: ["tests/reference-check.ts"],
    setupFiles: ["tests/setup.ts"],
    // The same value next.config.mjs inlines for src/lib/version.ts.
    env: { APP_VERSION: version },
  },
});
