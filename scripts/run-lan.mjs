// Start Next on 0.0.0.0 with the API's host allowlist opened (design D7).
// Usage: node scripts/run-lan.mjs <dev|start> [next args]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") { console.error("Usage: node scripts/run-lan.mjs <dev|start> [next args]"); process.exit(1); }
console.log("LAN mode: the app and its sync API are reachable from your network.");
const child = spawn(process.execPath, [nextBin, mode, "-H", "0.0.0.0", ...process.argv.slice(3)],
  { stdio: "inherit", env: { ...process.env, LAWAPP_ALLOW_LAN: "1" } });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
