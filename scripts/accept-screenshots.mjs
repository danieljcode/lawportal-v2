// Accept new screenshots for e2e/visual.spec.ts (LP-117, docs/testing.md).
//
// The approved screenshots must come from CI's Linux image, so this takes them from the current
// branch's latest failed CI run: it downloads the run's e2e-failures artefact (GitHub CLI, `gh`)
// and copies each `<name>-actual.png` over e2e/screenshots/<name>.png. Review and commit them.
//
// Usage: npm run screenshots:accept [run id]
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "e2e", "screenshots");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const id =
  process.argv[2] ||
  run("gh", [
    ..."run list --workflow ci.yml --status failure --limit 1 --json databaseId".split(" "),
    "--branch",
    branch,
    "--jq",
    ".[0].databaseId",
  ]);
if (!id) throw new Error(`No failed CI run on ${branch}.`);

const tmp = mkdtempSync(path.join(tmpdir(), "lawapp-shots-"));
try {
  run("gh", ["run", "download", id, "--name", "e2e-failures", "--dir", tmp]);
  mkdirSync(dest, { recursive: true });
  const shots = readdirSync(tmp, { recursive: true }).filter((f) => f.endsWith("-actual.png"));
  for (const f of shots)
    copyFileSync(path.join(tmp, f), path.join(dest, path.basename(f).replace(/-actual\.png$/, ".png")));
  console.log(`Accepted ${shots.length} screenshot(s) from CI run ${id} into e2e/screenshots/.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
