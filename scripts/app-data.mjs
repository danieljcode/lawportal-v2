// Puts the app's data files into src/data (LP-165). The court forms, their index and the penal
// code are the server's own material, so they live in the private lawportal-reference repo
// (app-data/), not here. Runs before every dev run, test and build (package.json), and on its own
// as `npm run app-data`. The files come from, in order:
//
// 1. CI's checkout of the private repo, .agents/reference/jsa/app-data/;
// 2. GitHub, with APP_DATA_TOKEN (a read-only token for that repo; set on Vercel), or the
//    token `gh auth token` prints on a developer's own computer;
// 3. the copy already in src/data, if it came from one of those;
// 4. the neutral sample in src/data/sample/, so anyone can build and test the public code.
//
// APP_DATA=sample skips 1 to 3, to try the public code as a stranger would.
//
// src/data/.app-data says which ("real" or "sample"); tests that need the real forms skip
// without it. A Vercel build never ships the sample: it fails instead, and the live app keeps
// its last good deploy.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src/data");
export const FILES = ["forms.json", "form-index.json", "penal-code.json"];
export const MARKER = path.join(DATA, ".app-data");
const CHECKOUT = path.join(ROOT, ".agents/reference/jsa/app-data");
const REPO = "danieljcode/lawportal-reference";

function token() {
  if (process.env.APP_DATA_TOKEN) return process.env.APP_DATA_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

async function download(auth) {
  const out = {};
  for (const f of FILES) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/app-data/${f}`, {
      headers: { Authorization: `Bearer ${auth}`, Accept: "application/vnd.github.raw+json" },
    });
    if (!res.ok) throw new Error(`${f}: GitHub answered ${res.status}`);
    out[f] = await res.text();
  }
  return out;
}

function write(files, kind) {
  for (const [f, text] of Object.entries(files)) {
    JSON.parse(text); // never write a file the app can't read
    writeFileSync(path.join(DATA, f), text);
  }
  writeFileSync(MARKER, kind + "\n");
}

const kindNow = () => (existsSync(MARKER) ? readFileSync(MARKER, "utf8").trim() : "");

function copySample() {
  for (const f of FILES) copyFileSync(path.join(DATA, "sample", f), path.join(DATA, f));
  writeFileSync(MARKER, "sample\n");
}

async function main() {
  if (process.env.APP_DATA === "sample") {
    copySample();
    return console.log("[app-data] sample data (APP_DATA=sample)");
  }
  if (FILES.every((f) => existsSync(path.join(CHECKOUT, f)))) {
    write(Object.fromEntries(FILES.map((f) => [f, readFileSync(path.join(CHECKOUT, f), "utf8")])), "real");
    return console.log("[app-data] real data from the reference checkout");
  }
  const auth = token();
  if (auth) {
    try {
      write(await download(auth), "real");
      return console.log("[app-data] real data from " + REPO);
    } catch (err) {
      console.warn("[app-data] couldn't download the real data: " + err.message);
    }
  }
  if (kindNow() === "real" && FILES.every((f) => existsSync(path.join(DATA, f)))) {
    return console.log("[app-data] keeping the real data already in src/data");
  }
  if (process.env.VERCEL) {
    throw new Error("No real app data on Vercel: set APP_DATA_TOKEN (docs/development.md, App data).");
  }
  copySample();
  console.warn("[app-data] using the sample data in src/data/sample (no access to " + REPO + ")");
}

main().catch((err) => {
  console.error("[app-data] " + err.message);
  process.exitCode = 1;
});
