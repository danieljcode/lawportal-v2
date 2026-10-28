# Dependencies

How packages are kept up to date and checked for security problems (LP-85).

## Dependabot

`.github/dependabot.yml` opens update pull requests every Monday:

- **npm packages:** minor and patch updates are grouped into one PR; each major update gets its own
  PR. At most 5 are open at once.
- **Pairs that must stay on the same version** always arrive together, in one PR, majors included:
  `playwright` with `@playwright/test` (each needs its own browser build), and `next` with
  `eslint-config-next`. `tests/dependencies.test.ts` fails if either pair ever differs.
- **GitHub Actions** (the `actions/…` steps in the workflows): minor and patch updates grouped, majors
  separate.
- **Titles** are `chore(deps): …`, `chore(deps-dev): …` (development-only packages) or
  `ci(deps): …` (Actions). The commit check accepts these without a Jira key, so they don't need an
  issue.

Dependabot PRs don't get the repository's Actions secrets, so CI skips the parity tests on them (with
the usual note) unless `REFERENCE_TOKEN` is also added under **Settings → Secrets and variables →
Dependabot**.

### Handling a Dependabot PR

1. **Wait for CI.** It runs the security audit, every test and the build on the update. If it's red,
   don't merge: look at the failure, and fix it on the PR's branch or close the PR.
2. **Minor and patch updates** (the grouped PR): if CI is green, merge.
3. **Major updates** (one package jumping a major version, e.g. Next 15 → 16): read the package's
   changelog or upgrade guide for breaking changes first. Check anything the tests don't cover by
   running the app (`npm run build && npm start`) and opening a few forms, or run
   `npm run smoke:preview`. If the upgrade needs code changes, make a Jira issue for it rather than
   piling changes onto the Dependabot PR.
4. After merging, update local `main` as usual and run `npm install`.

To stop an unwanted update, comment `@dependabot ignore this major version` (or `… this dependency`)
on its PR.

## Security audit in CI

The CI workflow runs `npm audit --omit=dev --audit-level=high` after `npm ci`. It fails on **high or
critical** advisories in the packages that ship with the app. Development-only packages (test tools,
Playwright, TypeScript) are left to Dependabot, since they never reach users.

When the audit fails:

1. Run `npm audit --omit=dev` locally to see the advisory and which package pulls it in.
2. Prefer a normal update (`npm update <package>`, or merge the Dependabot PR) if one fixes it.
3. If the fix only exists in a breaking major version of the package that depends on it, an npm
   `overrides` entry in `package.json` can give that package a fixed copy of the vulnerable
   dependency instead. Check the build output stays the same.
4. Don't lower the audit level to get CI green.

### Overrides

There are none at the moment. Next 15 needed one (LP-85): it pinned PostCSS 8.4.31, which has
high-severity advisories (GHSA-qx2v-qp2m-jg93 and related), so `package.json` gave it PostCSS 8.5.31.
Next 16 ships a fixed PostCSS, so the override went with the upgrade (LP-97). If you add one, list it
here with the reason and when it can go.
