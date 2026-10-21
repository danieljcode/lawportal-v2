// Real-browser smoke check of the forum preview (regression guard for the blank-preview bug).
//
// Every phase runs in light and dark themes and in two kinds of context:
//   normal     a frame probe (a rAF loop) records the #preview text length on every painted
//              frame after each navigation; any frame with #form-view on screen and an empty
//              #preview fails.
//   throttled  requestAnimationFrame / cancelAnimationFrame are no-ops (a throttled, occluded,
//              background or efficiency-mode window that runs no frames).
// In both, #preview is read in the same evaluate that first sees #form-view, with no wait,
// and must already hold the rendered template.
//
// Phases:
//   load       fresh profile per form: page load with a hash, reload, then load "/" (last-form
//              restore) for civil-complaint, criminal-arraignment, small-claims-writ-of-execution
//              and every Additional Templates (extra-*) form.
//   nav        sidebar click, back, forward, a typed location.hash, a search result click,
//              theme toggle x3, highlight off then navigate.
//   seeded     saved characters, docket and draft: draft on load, "Filing as" switch and back,
//              home then reopen the same form after a switch (first read shows the new name),
//              docket "Use in form", reload and last-form restore with saved state.
//   sidebar    every form by sidebar click; typing reaches the preview; on a few forms
//              (normal context only) Highlight unfilled, the BBCode tab and Copy BBCode.
// Exits non-zero with the failures.
//
// Needs the app running and a Playwright browser.
// Env: PLAYWRIGHT_BROWSER=firefox (Playwright's Firefox build) or chromium (default);
//      PLAYWRIGHT_CHANNEL=msedge to use an installed Edge with chromium.
// Usage: node scripts/preview-smoke.mjs [baseUrl]   (default http://127.0.0.1:3000)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const browserName = process.env.PLAYWRIGHT_BROWSER === "firefox" ? "firefox" : "chromium";
const channel = browserName === "chromium" ? process.env.PLAYWRIGHT_CHANNEL || undefined : undefined;

const directory = JSON.parse(await readFile(path.join(root, "src", "data", "forms.json"), "utf8"));
const extraSrc = await readFile(path.join(root, "src", "data", "extra-forms.ts"), "utf8");
const extraIds = [...extraSrc.matchAll(/^\s*id:\s*"([^"]+)"/gm)].map((m) => m[1]);
const ids = [...directory.map((f) => f.id), ...extraIds];
/** Forms that also get the Highlight / BBCode / Copy BBCode checks. */
const DEEP = new Set([
  "criminal-arraignment",
  "small-claims-writ-of-execution",
  "civil-complaint",
  "extra-general-motion",
]);
/** Text each form's preview shows with no input. */
const EXPECT = {
  "civil-complaint": "CIVIL DIVISION",
  "criminal-arraignment": "CRIMINAL DIVISION",
  "small-claims-writ-of-execution": "Writ of Execution",
  "extra-general-motion": "MOTION TITLE",
};
const LOAD_IDS = ["civil-complaint", "criminal-arraignment", "small-claims-writ-of-execution", ...extraIds];

const CHAR_A = { id: "smokechara1", name: "Dan Tester", title: "Attorney at Law" };
const CHAR_B = { id: "smokecharb1", name: "Other Person", title: "Attorney at Law" };
const CASE = "90SCCC00147";

/** The 2-digit in-game year a case number starts with (FreestyleRP is 36 years back). */
const GAME_YY = String(new Date().getUTCFullYear() - 36).slice(-2);

/* ---------- init scripts (run in the page before any app script) ---------- */

function themeInit(t) {
  try {
    localStorage.setItem("lawapp_theme", t);
  } catch {
    // storage blocked
  }
}

function throttleInit() {
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
}

/** Records #preview's text length on each frame where #form-view exists (up to 240 per reset). */
function probeInit() {
  const raf = window.requestAnimationFrame.bind(window);
  const s = { frames: [] };
  window.__probe = s;
  const tick = () => {
    if (s.frames.length < 240 && document.querySelector("#form-view")) {
      const t = (document.querySelector("#preview")?.textContent || "").trim();
      s.frames.push(t.length);
    }
    raf(tick);
  };
  raf(tick);
}

/** Saved characters, a docket and a draft, written once per tab (a reload keeps what the app saved). */
function seedInit(seed) {
  try {
    if (sessionStorage.getItem("smoke_seeded")) return;
    sessionStorage.setItem("smoke_seeded", "1");
    localStorage.setItem("lawapp_chars", JSON.stringify(seed.chars));
    localStorage.setItem("lawapp_active_char", seed.chars[0].id);
    if (seed.dockets && seed.dockets.length)
      localStorage.setItem("lawapp_dockets_" + seed.chars[0].id, JSON.stringify(seed.dockets));
    if (seed.draft) localStorage.setItem("lawapp_draft_criminal-arraignment", JSON.stringify(seed.draft));
  } catch {
    // storage blocked
  }
}

/* ---------- checks ---------- */

const failures = [];
let checks = 0;

const previewText = () =>
  (document.querySelector("#preview")?.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function newContext(browser, theme, mode, seed) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await context.addInitScript(themeInit, theme);
  if (mode === "throttled") await context.addInitScript(throttleInit);
  else await context.addInitScript(probeInit);
  if (seed) await context.addInitScript(seedInit, seed);
  return context;
}

async function newPage(context, errors) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    // Resource loads (the templates' remote images) aren't app errors; Firefox words them differently.
    if (m.type() === "error" && !/Failed to load resource|Image corrupt or truncated/.test(m.text()))
      errors.push("console: " + m.text());
  });
  return page;
}

/** Reset the frame probe right before a navigation. */
const resetProbe = (page) => page.evaluate(() => window.__probe && (window.__probe.frames = []));

/** Poll without rAF (the throttled context has none in the page). */
const waitFor = (page, fn, arg, timeout = 3000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

/**
 * The first display of a form: wait for #form-view, then read #preview in that same evaluate.
 * It must already contain every `want` string and none of `not`. In the normal context, the
 * painted frames since the last probe reset must never show an empty preview.
 */
async function firstDisplay(page, ctx, label, want = [], not = []) {
  checks++;
  const fail = (why) => failures.push(`${ctx} ${label}: ${why}`);
  let first;
  try {
    first = await page
      .waitForFunction(
        () => {
          if (!document.querySelector("#form-view")) return false;
          return {
            text: (document.querySelector("#preview")?.textContent || "")
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          };
        },
        null,
        { timeout: 15000, polling: 10 },
      )
      .then((h) => h.jsonValue());
  } catch {
    fail("#form-view never appeared");
    return;
  }
  if (!first.text) fail("preview empty when the form first appeared");
  for (const w of want) if (!first.text.includes(w)) fail(`first read lacks "${w}"`);
  for (const n of not) if (first.text.includes(n)) fail(`first read still shows "${n}"`);
  // Let some frames paint, then the preview must still be there.
  await page.waitForTimeout(250);
  const later = await page.evaluate(previewText);
  if (!later) fail("preview blanked after it rendered");
  const frames = await page.evaluate(() => (window.__probe ? window.__probe.frames : null));
  if (frames) {
    const empty = frames.filter((n) => n === 0).length;
    if (empty) fail(`${empty} painted frame(s) with an empty preview (of ${frames.length})`);
  }
}

/** A later update (not a first display): wait until the preview shows it. */
async function updated(page, ctx, label, want = [], not = []) {
  checks++;
  try {
    await waitFor(
      page,
      ([w, n]) => {
        const t = (document.querySelector("#preview")?.textContent || "").replace(/\u00a0/g, " ");
        return w.every((x) => t.includes(x)) && !n.some((x) => t.includes(x));
      },
      [want, not],
    );
  } catch {
    const t = await page.evaluate(previewText);
    failures.push(
      `${ctx} ${label}: preview never showed ${JSON.stringify(want)} without ${JSON.stringify(not)} (has ${t.length} chars)`,
    );
  }
}

/** Navigate by clicking the sidebar link (popstate + hashchange in the browser). */
async function sidebar(page, id) {
  await resetProbe(page);
  await page.click(`#sidebar a[href="#filings/${id}"]`);
}

function flushErrors(ctx, phase, errors) {
  if (errors.length) failures.push(`${ctx} ${phase}: ${errors.join("; ")}`);
  errors.length = 0;
}

/* ---------- phases ---------- */

async function phaseLoad(browser, theme, mode, ctx) {
  for (const id of LOAD_IDS) {
    const want = EXPECT[id] ? [EXPECT[id]] : [];
    const errors = [];
    const context = await newContext(browser, theme, mode);
    const page = await newPage(context, errors);
    await page.goto(base + "/#" + id);
    await firstDisplay(page, ctx, `load /#${id}`, want);
    await page.reload();
    await firstDisplay(page, ctx, `reload /#${id}`, want);
    await page.goto(base + "/");
    await firstDisplay(page, ctx, `restore / -> ${id}`, want);
    const hash = await page.evaluate(() => location.hash);
    // The old hash it was loaded from comes back as the program's own (LP-103).
    if (hash !== "#filings/" + id) failures.push(`${ctx} restore ${id}: hash is "${hash}"`);
    flushErrors(ctx, "load " + id, errors);
    await context.close();
  }
}

async function phaseNav(browser, theme, mode, ctx) {
  const errors = [];
  const context = await newContext(browser, theme, mode);
  const page = await newPage(context, errors);
  await page.goto(base + "/#civil-complaint");
  await firstDisplay(page, ctx, "nav load civil-complaint", ["CIVIL DIVISION"]);

  await sidebar(page, "criminal-arraignment");
  await firstDisplay(page, ctx, "nav sidebar -> arraignment", ["CRIMINAL DIVISION"], ["CIVIL DIVISION"]);

  await resetProbe(page);
  await page.goBack();
  await firstDisplay(page, ctx, "nav back -> civil-complaint", ["CIVIL DIVISION"], ["CRIMINAL DIVISION"]);

  await resetProbe(page);
  await page.goForward();
  await firstDisplay(page, ctx, "nav forward -> arraignment", ["CRIMINAL DIVISION"], ["CIVIL DIVISION"]);

  await resetProbe(page);
  await page.evaluate(() => {
    location.hash = "#small-claims-writ-of-execution";
  });
  await firstDisplay(page, ctx, "nav typed hash -> writ", ["Writ of Execution"], ["CRIMINAL DIVISION"]);

  // Home (the Program Manager, LP-104), Court Filings, then a search result.
  await page.click("a.brand");
  await page.waitForSelector("#form-view", { state: "hidden" });
  await page.click("#pm-filings");
  await page.fill("#form-search", "arraign");
  await resetProbe(page);
  await page.click('#form-list a[href="#filings/criminal-arraignment"]');
  await firstDisplay(page, ctx, "nav search result -> arraignment", ["CRIMINAL DIVISION"]);

  // Theme toggle x3 (auto, light, dark in some order) keeps the preview.
  for (let i = 0; i < 3; i++) {
    await page.click("#theme-toggle");
    await page.waitForTimeout(50);
    checks++;
    if (!(await page.evaluate(previewText)).includes("CRIMINAL DIVISION"))
      failures.push(`${ctx} nav theme toggle ${i + 1}: preview lost`);
  }
  await page.fill("#form-search", "");

  // Highlight off, then navigate: the next form renders unhighlighted, immediately.
  await page.uncheck("#highlight");
  await sidebar(page, "civil-complaint");
  await firstDisplay(page, ctx, "nav highlight off -> civil-complaint", ["CIVIL DIVISION"]);
  checks++;
  const marks = await page.evaluate(() => document.querySelectorAll("#preview mark.unfilled").length);
  if (marks !== 0) failures.push(`${ctx} nav highlight off: ${marks} marks`);
  await page.check("#highlight");
  await updated(page, ctx, "nav highlight back on", ["CIVIL DIVISION"]);
  checks++;
  if (!(await page.evaluate(() => document.querySelectorAll("#preview mark.unfilled").length)))
    failures.push(`${ctx} nav highlight on: no marks`);
  flushErrors(ctx, "nav", errors);
  await context.close();
}

async function phaseSeeded(browser, theme, mode, ctx) {
  const seed = {
    chars: [CHAR_A, CHAR_B],
    dockets: [{ id: "smokedkt01", caseNumber: CASE, plaintiff: "Ann Smith", status: "Open" }],
    draft: { values: { "Defendant name": "Jane Draft" }, autofilled: {} },
  };
  const errors = [];
  const context = await newContext(browser, theme, mode, seed);
  const page = await newPage(context, errors);

  await page.goto(base + "/#criminal-arraignment");
  await firstDisplay(page, ctx, "seeded draft load", ["CRIMINAL DIVISION", "Jane Draft"]);

  await page.goto(base + "/#civil-complaint"); // a same-document hash change from the arraignment
  await page.reload();
  await firstDisplay(page, ctx, "seeded civil-complaint as A", ["CIVIL DIVISION", CHAR_A.name]);

  await page.selectOption("#active-character", CHAR_B.id);
  await updated(page, ctx, "seeded Filing as -> B", [CHAR_B.name], [CHAR_A.name]);
  await page.selectOption("#active-character", CHAR_A.id);
  await updated(page, ctx, "seeded Filing as -> back to A", [CHAR_A.name], [CHAR_B.name]);

  // Home, switch, reopen the same form: the first read shows B, never A's old output.
  await page.click("a.brand");
  await page.waitForSelector("#form-view", { state: "hidden" });
  await page.selectOption("#active-character", CHAR_B.id);
  await page.click("#pm-filings");
  await sidebar(page, "civil-complaint");
  await firstDisplay(page, ctx, "seeded reopen after switch", ["CIVIL DIVISION", CHAR_B.name], [CHAR_A.name]);

  // Docket "Use in form" (A keeps the docket).
  await page.selectOption("#active-character", CHAR_A.id);
  await updated(page, ctx, "seeded back to A", [CHAR_A.name]);
  await page.click("#open-dockets");
  await page.click('#docket-list button:has-text("Use in form")');
  await updated(page, ctx, "seeded docket Use in form", [CASE, "Ann Smith"]);

  // Saved drafts and characters across a reload and a last-form restore.
  await page.waitForTimeout(700); // the draft writer's debounce
  await resetProbe(page);
  await page.reload();
  await firstDisplay(page, ctx, "seeded reload with saved draft", ["CIVIL DIVISION", CASE]);
  await page.goto(base + "/");
  await firstDisplay(page, ctx, "seeded restore with saved draft", ["CIVIL DIVISION", CASE]);
  flushErrors(ctx, "seeded", errors);
  await context.close();
}

async function phaseSidebar(browser, theme, mode, ctx) {
  const errors = [];
  const context = await newContext(browser, theme, mode);
  const page = await newPage(context, errors);
  await page.goto(base + "/#filings", { waitUntil: "networkidle" });
  await page.waitForSelector(".m-app, .app-window");
  const appliedTheme = await page.evaluate(() => document.documentElement.dataset.theme || "");

  for (const id of ids) {
    const fail = (why) => failures.push(`${ctx} sidebar ${id}: ${why}`);
    await sidebar(page, id);
    await firstDisplay(page, ctx, `sidebar ${id}`, EXPECT[id] ? [EXPECT[id]] : []);
    const input = page.locator('#fields input[type="text"]').first();
    if ((await input.count()) > 0) {
      const marker = "ZZSMOKE" + checks;
      await input.fill(marker);
      await updated(page, ctx, `sidebar ${id} typing`, [marker]);
    }

    if (DEEP.has(id) && mode === "normal") {
      // Highlight unfilled: marks present when on, gone when off.
      const marks = () => document.querySelectorAll("#preview mark.unfilled").length;
      const on = await page.evaluate(marks);
      await page.uncheck("#highlight");
      await page.waitForTimeout(100);
      const off = await page.evaluate(marks);
      await page.check("#highlight");
      await page.waitForTimeout(100);
      const again = await page.evaluate(marks);
      if (!(on > 0 && off === 0 && again === on)) fail(`highlight toggle marks on/off/on = ${on}/${off}/${again}`);

      await page.click("#tab-bbcode");
      const bb = await page.inputValue("#bbcode");
      if (!/\[[a-z]+[^\]]*\]/i.test(bb)) fail("BBCode tab has no BBCode");
      let copied = "skipped";
      if (browserName === "chromium") {
        await page.click("#copy-bbcode");
        // Empty required fields (LP-87) ask first: copy anyway.
        if (await page.isVisible("#missing-anyway")) await page.click("#missing-anyway");
        await waitFor(page, () => (document.querySelector("#copy-status")?.textContent || "").length > 0);
        const status = await page.textContent("#copy-status");
        // The OS clipboard may turn \n into \r\n (Windows), and a textarea normalizes line breaks.
        const norm = (s) => s.replace(/\r\n?/g, "\n");
        const clip = norm(await page.evaluate(() => navigator.clipboard.readText()));
        if (status !== "BBCode copied." || clip !== norm(bb))
          fail(`Copy BBCode: status "${status}", clipboard ${clip.length} vs ${norm(bb).length} chars`);
        copied = "copied";
      }
      await page.click("#tab-preview");
      await waitFor(page, () => (document.querySelector("#preview")?.textContent || "").trim().length > 0);
      console.log(`  ${ctx} ${id}: highlight ${on}/${off}/${again}, bbcode ${bb.length} chars, ${copied}`);
    }
    flushErrors(ctx, "sidebar " + id, errors);
  }
  console.log(`  ${ctx} (data-theme="${appliedTheme}"): ${ids.length} forms clicked`);
  await context.close();
}

/* ---------- FreestyleRP only (LP-68, LP-69, LP-70) ---------- */

async function phaseFreestyle(browser, theme, mode, ctx) {
  const errors = [];
  const context = await newContext(browser, theme, mode, { chars: [CHAR_A], dockets: [], draft: null });
  const page = await newPage(context, errors);

  // civil-complaint: FreestyleRP court wording and an in-game SC case number, no GTAW.
  await page.goto(base + "/#civil-complaint");
  await firstDisplay(
    page,
    ctx,
    "freestyle civil-complaint",
    ["SAN ANDREAS COURT", GAME_YY + "SCCC"],
    ["SUPERIOR COURT OF THE STATE", "GJCC"],
  );
  checks++;
  if (await page.$("#active-server")) failures.push(`${ctx} freestyle: the server toggle is still in the toolbar`);

  // criminal-case-schedule: a today prefill and an SC criminal case number.
  await resetProbe(page);
  await page.click(`#sidebar a[href="#filings/criminal-case-schedule"]`);
  await firstDisplay(page, ctx, "freestyle criminal-case-schedule", [GAME_YY + "SCCR"], ["GJCR"]);

  flushErrors(ctx, "freestyle", errors);
  await context.close();
}

/* ---------- run ---------- */

const browser = await (browserName === "firefox" ? firefox : chromium).launch({ channel });
console.log(`browser: ${browserName}${channel ? " (" + channel + ")" : ""} ${browser.version()}, base ${base}`);
try {
  for (const theme of ["light", "dark"]) {
    for (const mode of ["normal", "throttled"]) {
      const ctx = `${theme}/${mode}`;
      const before = failures.length;
      await phaseLoad(browser, theme, mode, ctx);
      await phaseNav(browser, theme, mode, ctx);
      await phaseSeeded(browser, theme, mode, ctx);
      await phaseSidebar(browser, theme, mode, ctx);
      await phaseFreestyle(browser, theme, mode, ctx);
      console.log(`${ctx}: ${failures.length - before} failure(s)`);
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`FAIL ${failures.length}:\n` + failures.join("\n"));
  process.exit(1);
}
console.log(
  `OK: ${checks} preview checks (load, reload, restore, back/forward, hash, search, theme, seeded, sidebar) passed.`,
);
