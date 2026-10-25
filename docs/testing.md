# Testing

```bash
npm test                          # every suite (vitest)
npx vitest run tests/<file>       # one suite
npx vitest run -u tests/<file>    # update that suite's snapshots (review the diff)
npm run build                     # type-checks the app and the tests, and builds
```

Run `npm test` and `npm run build` before calling any change done.

## Where tests live

All suites are in `tests/` and use [Vitest](https://vitest.dev). Most run in Node; files that need a
DOM start with `// @vitest-environment jsdom`. UI tests render the real `App` (or one component)
with React and drive it through the DOM. Programs load lazily (LP-122), so `tests/setup.ts` loads all
of them before each DOM suite, as the app's idle preload does; `lazyPrograms.test.tsx` covers the lazy
path itself.

| Area             | Suites                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Template engine  | `template.test.ts`, `template.parity.test.ts`, `layout.test.ts`                                                    |
| Safety           | `xss.test.ts`, `template-safety.test.ts`, `safeHtml.test.ts`                                                       |
| Wording          | `strings.test.ts` (no outside branding or links in the app's own text)                                             |
| Outputs          | `bbcode.test.ts`, `discord*.test.ts`, `docx.test.ts`, `preview.test.ts`                                            |
| Forms and state  | `formState.test.ts`, `formView.test.ts`, `extra-forms.test.ts`, `draftWriter.test.ts`                              |
| FreestyleRP      | `freestyle.test.ts`, `freestyle-wording.test.ts`, `freestyleApp.test.tsx`                                          |
| Stores and files | `stores.test.ts`, `characterFile.test.ts`                                                                          |
| Sync             | `sync-api.test.ts` (the routes, against a temp directory), `sync-client.test.ts` (stubbed `fetch`), `body.test.ts` |
| UI               | `dialogs.test.ts`, `discordPanel.test.ts`                                                                          |
| Releases         | `release.test.ts`, `theme-changelog.test.ts`                                                                       |
| Conventions      | `commit-format.test.ts` (the commit and PR title check)                                                            |

## What `tests/xss.test.ts` protects

It renders a template with every field type (text, textarea, list, paragraphs, spoiler, select,
number, image, URL…) filled with hostile input, and checks that none of it becomes markup: no new
tags, no event attributes, no `javascript:` links. It's the backstop for the rule that **every user
value goes through `escapeHtml`** (see [Templates and forms](templates-and-forms.md#escaping-why-user-text-cant-become-markup)).
If it fails, fix the escaping; never relax the test.

## Snapshots

`tests/__snapshots__/` holds the expected output of the template engine (`template.parity`),
the layout (`layout`) and Discord (`discord`) for every form. When a change is meant to alter the
output, update them with `-u` and **read the diff**: only what you meant to change should move.

Running the suites on Windows can rewrite these files with different line endings while their
content stays the same; `git checkout -- tests/__snapshots__` puts them back.

## Parity tests and reference data

The parity suites compare our template engine and BBCode converter with the original JSA engine,
using the [reference data](templates-and-forms.md#reference-data) in `.agents/reference/jsa/`.

- Without the data they're **skipped, visibly**: the run prints
  `[parity] skipped: reference data not found`, and each skipped suite's name says so.
- With `LAWAPP_REQUIRE_REFERENCE=1` a missing file **fails** the run instead (CI sets this).
- `template-safety.test.ts` also checks that `forms.json` is exactly what `port-forms` would write
  from the reference data.

## CI

`.github/workflows/ci.yml` runs on every push and pull request, on Node 22:

1. Checks out the code, and the reference data when the `REFERENCE_TOKEN` secret is set (a
   read-only token for `danieljcode/lawportal-reference`). Pull requests from forks don't get the
   secret, so they skip the parity tests.
2. `npm ci`, then `npm audit --omit=dev --audit-level=high` (see [Dependencies](dependencies.md)),
   `npm run lint` and `npm run format:check` (see [Development](development.md#code-style-and-editor-set-up)),
   `npm test` (with `LAWAPP_REQUIRE_REFERENCE=1` when the data was checked out) and `npm run build`.
3. The [end-to-end smoke tests](#end-to-end-smoke-tests-lp-6) against that build. If any fail, their
   screenshots and traces are uploaded as the `e2e-failures` artefact on the run.

A second workflow, **Conventions** (`.github/workflows/conventions.yml`), runs on pull requests and
checks every commit message and the PR title against the commit format (LP-84). It's covered by
`tests/commit-format.test.ts`.

## End-to-end smoke tests (LP-6)

```bash
npm run build
npm run test:e2e        # starts the built app on port 3210, runs, and stops it
```

`e2e/smoke.spec.ts` uses Playwright's test runner (`playwright.config.ts`) to walk the key journeys in
a real Chromium, at **desktop** (1440×900) and **phone** (Pixel 7) sizes, each from empty storage:

- open a form from the sidebar (behind ☰ on a phone), fill it in, and see the preview follow;
- **Copy for forum**: the clipboard holds the filing as HTML;
- **Download .docx**: a real Word file (a zip) downloads;
- add a character, and it appears in "Filing as";
- add a case to a judge's docket.

The suite takes a few seconds. It needs Chromium once: `npx playwright install chromium`. The
server gets a throwaway sync directory (`test-results/sync`). A failing test keeps a screenshot and
a trace in `test-results/`; open a trace with `npx playwright show-trace <path>/trace.zip`. Locally,
an app already running on port 3210 is reused.

## Playwright scripts

These drive a real browser against a running app, so they aren't part of `npm test`. They need
Chromium (`npx playwright install chromium`), or `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge.
Start the app first (`npm run build && npm start`, or `npm run dev`); both take the app's address as
an argument (default `http://127.0.0.1:3000`).

- **`npm run smoke:preview`**: opens every form in light and dark themes, at normal and throttled
  speed, and checks the preview renders on load, reload, restore, back/forward, search and with
  seeded characters and dockets, plus the FreestyleRP wording and case numbers. Prints
  `OK: <n> preview checks … passed.` or lists the failures.
- **`npm run screenshots`**: saves home, form, dialog and Discord-tab screenshots in both themes to
  `.agents/screenshots/`. The README's screenshots are copied from there into `docs/screenshots/`.
