# Development

Everything needed to get from a fresh clone to a running app, and what each script does.

## Prerequisites

- **Node.js 22.6 or newer** (CI uses Node 22; Node 24 works too). `port-forms` and `release-notes`
  load TypeScript directly with `--experimental-strip-types`, which older Node doesn't have.
- **npm** (comes with Node) and **git**.
- Optional:
  - **Access to `danieljcode/lawportal-reference`**, only for `npm run port-forms` and the parity
    tests (see [Templates and forms](templates-and-forms.md#reference-data)). Everything else works
    without it.
  - **Chromium for Playwright** (`npx playwright install chromium`), only for `npm run screenshots`
    and `npm run smoke:preview`.
  - **The GitHub CLI** (`gh`), for opening pull requests and making releases.

## First run

```bash
git clone https://github.com/danieljcode/lawportal-v2.git
cd lawportal-v2
npm install
npm run dev
```

Open http://localhost:3000. The page is client-only, so it shows "Loading…" briefly while the app
loads. Your characters, dockets and drafts live in this browser's local storage; nothing needs
setting up first.

`npm install` also runs `prepare`, which points git at `.githooks/` (`git config core.hooksPath
.githooks`), so the commit-message check runs before every commit (see
[Contributing](contributing.md#checked-automatically-lp-84)).

Check the set-up:

```bash
npm test        # the parity suites skip without the reference data; everything else should pass
npm run build
```

For a production build:

```bash
npm run build
npm start
```

Both `dev` and `start` bind to `127.0.0.1`, so only this computer can reach the app.

## Code style and editor set-up

Formatting is Prettier's job and ESLint checks for mistakes (LP-86); CI runs both.

- **Prettier** (`.prettierrc.json`): its defaults, with lines up to 120 characters. Generated files
  are left alone (`.prettierignore`: `forms.json`, snapshots, the lockfile).
- **ESLint** (`eslint.config.mjs`): Next.js's `core-web-vitals` and TypeScript rules, with style
  rules turned off in favour of Prettier. Since Next.js 16 (LP-97) these include React's newer hooks
  rules: for example, don't call `setState` straight inside an effect to reset state when a value
  changes; adjust it while rendering instead (see `DiscordPanel` or `SyncPanel`). A rule is only switched off on a line with a reason:
  `// eslint-disable-next-line <rule> -- <why>`.
- **Kiro or VS Code:** `.vscode/settings.json` makes Prettier the formatter and formats on save,
  using the project's config. Install the two recommended extensions when prompted (Prettier,
  `esbenp.prettier-vscode`, and ESLint, `dbaeumer.vscode-eslint`; Kiro gets them from Open VSX).
- Before pushing: `npm run lint` and `npm run format:check`, or `npm run format` to fix formatting.

## Other devices on your network (LAN mode)

```bash
npm run build && npm run start:lan
```

`scripts/run-lan.mjs` starts Next on `0.0.0.0` with `LAWAPP_ALLOW_LAN=1` and prints
`LAN mode: the app and its sync API are reachable from your network.` Open
`http://<this computer's LAN IP>:3000` on the other device.

- Prefer `start:lan`. `npm run dev:lan` works too, but `next dev` warns about cross-origin dev
  requests from other devices.
- Over plain http on the LAN the browser's clipboard API isn't available (it isn't a secure
  context), so the app copies through a text selection instead.
- Traffic is unencrypted: only use LAN mode on a network you trust. The sync API is rate limited
  (see [Sync](sync.md#server-storage)).

## Scripts

| Command                 | What it does                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Development server on `127.0.0.1:3000`, with hot reload.                                                                                        |
| `npm run dev:lan`       | The same on `0.0.0.0`, API open to the network.                                                                                                 |
| `npm run build`         | Type-checks the app and tests, and makes a production build.                                                                                    |
| `npm start`             | Serves the production build on `127.0.0.1:3000`.                                                                                                |
| `npm run start:lan`     | The same on `0.0.0.0`, API open to the network.                                                                                                 |
| `npm test`              | Runs every test suite once (Vitest). See [Testing](testing.md).                                                                                 |
| `npm run test:e2e`      | End-to-end smoke tests in a real browser, desktop and phone (run `npm run build` first). See [Testing](testing.md#end-to-end-smoke-tests-lp-6). |
| `npm run lint`          | ESLint (Next.js, React and TypeScript rules); fails on any error or warning.                                                                    |
| `npm run format`        | Formats every file with Prettier.                                                                                                               |
| `npm run format:check`  | Checks formatting without changing anything (what CI runs).                                                                                     |
| `npm run port-forms`    | Regenerates `src/data/forms.json` from the reference data. See [Templates and forms](templates-and-forms.md#regenerating-the-court-forms).      |
| `npm run screenshots`   | Screenshots of the running app into `.agents/screenshots/` (Playwright).                                                                        |
| `npm run smoke:preview` | Browser smoke test of every form against the running app (Playwright).                                                                          |
| `npm run release-notes` | Prints the GitHub Release notes for the version in `package.json`. See [Releasing](releasing.md).                                               |
| `npm run prepare`       | Runs on `npm install`: turns on the commit-message hook in `.githooks/`.                                                                        |

## Environment variables

| Variable                     | Used by            | Effect                                                                          |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `LAWAPP_ALLOW_LAN=1`         | API routes         | Answer requests from any host, not only `localhost`. The `:lan` scripts set it. |
| `LAWAPP_SYNC_DIR`            | Sync API           | Where sync files go (default `data/sync/`).                                     |
| `LAWAPP_REQUIRE_REFERENCE=1` | Tests              | Fail instead of skipping when the reference data is missing. CI sets it.        |
| `PLAYWRIGHT_CHANNEL`         | Playwright scripts | Use an installed browser, e.g. `msedge`.                                        |
| `BASE_URL`                   | Playwright scripts | The app's address, instead of passing it as an argument.                        |

## Where things are saved

- **In the browser:** local storage keys starting `lawapp_` (see
  [Architecture](architecture.md#client-data-the-stores)).
- **On this computer:** sync files in `data/sync/` (gitignored), and the reference data and
  screenshots in `.agents/` (gitignored).

## Common problems

| Symptom                                                       | Cause and fix                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Another device gets errors, or the API answers `421`          | The app wasn't started in LAN mode. Use `npm run start:lan`.                                                 |
| Copy doesn't work on another device                           | Expected over plain http: the app falls back to a text selection, so paste should still work.                |
| `[parity] skipped: reference data not found`                  | Normal without access to the reference data. With access, clone it into `.agents/reference/jsa` (see above). |
| `port-forms: the reference forms aren't here`                 | The same: `port-forms` needs the reference data.                                                             |
| `bad option: --experimental-strip-types`                      | Node is older than 22.6. Upgrade Node.                                                                       |
| Snapshot files show as changed after running tests on Windows | Only line endings changed: `git checkout -- tests/__snapshots__`.                                            |
| A commit is refused with "doesn't follow the convention"      | The commit-message hook. Fix the message as it explains, or see [Contributing](contributing.md).             |
| "Some saved data couldn't be read and was set aside."         | A saved value was damaged. See [Sync, storage and recovery](sync.md#damaged-data).                           |
