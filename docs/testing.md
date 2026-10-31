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
| Forms and state  | `formState.test.ts`, `formView.test.ts`, `extra-forms.test.ts`, `form-index.test.ts`, `draftWriter.test.ts`        |
| Game and courts  | `gameTime.test.ts`, `court-wording.test.ts`, `oneServer.test.tsx`                                                  |
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
3. The [end-to-end smoke tests](#end-to-end-smoke-tests-lp-6), [screenshot tests](#screenshot-tests-lp-117)
   and [accessibility check](#accessibility-check-lp-118) against that build. If any fail, their
   screenshots and traces (and a screenshot test's expected, actual and diff images) are
   uploaded as the `e2e-failures` artefact on the run.

The job runs in Playwright's Linux image (`mcr.microsoft.com/playwright`), which brings Chromium and
its fonts. Keep its tag at the `@playwright/test` version in `package.json` when that's updated.

A second workflow, **Conventions** (`.github/workflows/conventions.yml`), runs on pull requests and
checks every commit message and the PR title against the commit format (LP-84). It's covered by
`tests/commit-format.test.ts`.

## End-to-end smoke tests (LP-6)

```bash
npm run test:e2e        # builds, starts the app on port 3210, runs, and stops it
```

Locally the command runs `npm run build` first, so the tests always run the current code (LP-134).
In CI the build is its own step, so `test:e2e` only starts the app.

`e2e/smoke.spec.ts` uses Playwright's test runner (`playwright.config.ts`) to walk the key journeys in
a real Chromium, at **desktop** (1440×900) and **phone** (Pixel 7) sizes, each from empty storage:

- each program's key journey, opened from the home screen (a tile in Modern, an icon in Classic's
  Program Manager) and run in **both layouts** (LP-111):
  - **Court Filings**: open a form from the sidebar (behind ☰ on a phone), fill it in, and see the
    preview follow;
  - **Case File**: add a case, search for it and find it;
  - **Clients**: a new client's intake opens a case;
  - **Law Library**: search the penal code;
  - **Settings**: switch to the dark theme;
- **Copy for forum**: the clipboard holds the filing as HTML;
- **Download .docx**: a real Word file (a zip) downloads;
- **Download PDF**: the print dialog shows only the filing, named after the form (Save as PDF);
- add a character, and it appears in "Filing as";
- add a case to a judge's docket;
- the home screen's first load stays within the JavaScript budget (README, "First-load budget").

The suite takes a few seconds. It needs Chromium once: `npx playwright install chromium`. The
server gets a throwaway sync directory (`test-results/sync`). A failing test keeps a screenshot and
a trace in `test-results/`; open a trace with `npx playwright show-trace <path>/trace.zip`. Locally,
an app already running on port 3210 is reused, without building, so stop it first if it's out of date.

## Accessibility check (LP-118)

`e2e/a11y.spec.ts` runs [axe](https://github.com/dequelabs/axe-core) (`@axe-core/playwright`) on the
same screens as the screenshot tests: the home screen and each program's start page, Modern and
Classic, light and dark, at both sizes. It runs everywhere `npm run test:e2e` does.

- **Serious and critical** issues fail the test, listed with the elements they're on.
- **Minor and moderate** ones are printed in the test output but don't fail.
- A known issue that can't be fixed straight away goes in `ALLOWED` at the top of the spec: the axe
  rule id, with the Jira key of the issue that fixes it.

It's an automatic first pass. axe also prints a moderate `skip-link` note on links such as
`#filings/<form>`: it reads a hash route as a link to an element on the page. That's how the app's
routing works (`src/shell/useRoute.ts`), so it stays.

### Keyboard, focus, zoom and contrast (LP-29)

- **`e2e/focus.spec.ts`** tabs through the home screen and each program's start page, Modern and
  Classic, light and dark: every stop must show its focus (an outline, or a ring, background or
  colour of its own) and have a name with words in it, not only an icon.
- **`e2e/keyboard.spec.ts`** does the key journeys with the keyboard alone, in both themes: switch
  programs from home, open a case, fill in a filing and copy it for the forum, Help → Contents from
  the menus, and change the theme in Settings.
- **200% zoom** (in `e2e/a11y.spec.ts`): at 640×400, a 1280×800 screen zoomed to 200%, no screen
  scrolls sideways, nor its top bars.
- **`tests/contrast.test.ts`** checks the theme colours in `globals.css` in all four skins: text
  pairs at least 4.5:1 and the focus outline 3:1 (WCAG AA), including pairs axe never sees on screen
  (search marks, hovers, the error icon). A new colour pair belongs in its `PAIRS`.
- **Reduced motion**: the only animation is the Classic startup screen, which holds still
  (`tests/boot.test.tsx`).

### Screen-reader pass (by hand)

Automated tests can't hear what a screen reader says. Before a release that changes the screens,
go through these with NVDA (Windows, free) or VoiceOver (Mac), in Modern and Classic:

1. Home: each program tile (or Program Manager icon) is announced by name; Case File says when
   something is due.
2. Switch programs from the rail, the menus and Ctrl+K; the new program's name is announced.
3. Court Filings: pick a form, fill in fields (each label read out, required ones said so), Copy for
   forum, and the "Copied" status is announced.
4. Case File: open a case, add a deadline with the date picker, add an exhibit.
5. Settings: change the theme and light or dark; open and close the Characters dialog (the focus
   goes back to where it was).
6. Help: search, open a topic, follow a link, Back.

Fix what's wrong, or ticket it in Jira with the `accessibility` label.

## Screenshot tests (LP-117)

`e2e/visual.spec.ts` screenshots the home screen and each program's start page in the Modern and
Classic layouts, light and dark, at both sizes, and compares them with the approved screenshots in
`e2e/screenshots/`. The screens are opened by `e2e/views.ts`: the clock is frozen, new ids come out
the same, and the storage is seeded with one character and one case, so a screenshot only changes
when the layout does.

Fonts render differently on each system, so the tests only run on Linux, where CI runs them in
Playwright's image; on Windows and macOS they skip. To change the approved screenshots on purpose:

1. Push the change. CI fails the screenshots that differ (or are new) and uploads the new ones.
2. Check the diff images in the run's `e2e-failures` artefact.
3. `npm run screenshots:accept` (needs the GitHub CLI, `gh`) copies them from the branch's latest
   failed run into `e2e/screenshots/`; pass a run id to pick another run. Commit them.

**Nothing private is pictured (LP-168).** The approved screenshots are public, but the court forms
and penal code aren't (LP-165), so `visual.spec.ts` masks the form list and the Law Library's
chapters and charges (`PRIVATE`). Mask anything new that shows them. The README's screenshots
(`npm run screenshots`) are taken on the sample data: `APP_DATA=sample npm run build`, then
`npm start`.

## Playwright scripts

These drive a real browser against a running app, so they aren't part of `npm test`. They need
Chromium (`npx playwright install chromium`), or `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge.
Start the app first (`npm run build && npm start`, or `npm run dev`); both take the app's address as
an argument (default `http://127.0.0.1:3000`).

- **`npm run smoke:preview`**: opens every form in light and dark themes, at normal and throttled
  speed, and checks the preview renders on load, reload, restore, back/forward, search and with
  seeded characters and dockets, plus the court wording and case numbers. Prints
  `OK: <n> preview checks … passed.` or lists the failures.
- **`npm run screenshots`**: saves home, form, Settings, Discord-tab and Classic home screenshots
  in light and dark, with one character and one case, to `.agents/screenshots/`. The README's screenshots are copied from there into `docs/screenshots/`.
