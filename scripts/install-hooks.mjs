// Run by `npm install` (the "prepare" script): points git at .githooks/, so the
// commit-msg hook checks every commit message (LP-84). Does nothing, and never
// fails the install, outside a git checkout or when git isn't available.
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
} catch {
  // not a git checkout (e.g. an installed tarball): no hooks to set up
}
