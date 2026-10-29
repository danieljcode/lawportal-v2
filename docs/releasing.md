# Releasing

How to ship a version (set up in LP-74, automated with release-please in LP-116).

Versions follow the Jira versions: Jira `v0.2` is `0.2.0` in `package.json`, tag `v0.2.0`.

## The Release PR (release-please)

`.github/workflows/release-please.yml` runs on every push to `main`. It keeps one **Release PR** open,
titled `chore(main): release X.Y.Z`, with the next version and `CHANGELOG.md` built from the commit
messages since the last release. Nothing is released until that PR is merged.

- **The changelog** groups commits by type: Features (`feat`), Fixes (`fix`), Performance (`perf`)
  and Docs (`docs`). `refactor`, `test`, `ci`, `chore` and `style` are left out, and Dependabot's
  `chore(deps)` updates with them. The workflow then tidies it and the Release PR's description
  (`scripts/tidy-changelog.mjs`): it drops an entry repeated in a version (a merge commit holds its
  PR's title, which release-please reads as one more commit) and links every `[LP-n]` to its Jira
  issue, which release-please can't.
- **The version:** before 1.0, a `feat` bumps the patch (0.2.0 → 0.2.1) and a breaking change
  (`feat!:` or a `BREAKING CHANGE:` footer) bumps the minor. To ship a Jira version, set it with a
  `Release-As: 0.3.0` footer on a commit to `main` (a line on its own at the end of the message);
  the Release PR then shows that version. A squash merge keeps it only if the squashed message
  does: check the footer is in it, or merge with `gh pr merge --squash --body-file <message>`.
- **Settings:** `release-please-config.json` (the sections, the pre-1.0 bumps) and
  `.release-please-manifest.json` (the last version released, which release-please updates).
- **It needs** GitHub's "Allow GitHub Actions to create and approve pull requests" (Settings →
  Actions → General → Workflow permissions), or it can't open the PR.
- The Release PR is opened by GitHub Actions, so CI doesn't run on it. It changes only
  `CHANGELOG.md`, `package.json`, `package-lock.json` and the manifest.

### Shipping a version

When every issue in the Jira version is Done:

1. **Check the Release PR** shows the Jira version (add a `Release-As:` footer if not) and its
   changelog reads well, then **merge it**. release-please tags `vX.Y.Z`, publishes the GitHub
   Release with the same notes (the workflow tidies them too), and the merge bumps
   `package.json`.
2. **Release the Jira version** (`v0.3`): mark it Released, with today's date.
3. **Check What's new matches.** The in-app What's new stays hand-written for players: in a normal
   pull request, give the release's entry in `src/data/changelog.ts` `version: "0.3.0"` and make
   sure it says everything players will notice. A test fails if a What's new version is ahead of
   `package.json`, so do this after the Release PR is merged.

## Manual release (fallback)

The steps from before LP-116, for when release-please can't run. Release when every issue in the
Jira version is Done, from an up-to-date `main`:

1. **Bump the version:** set `"version"` in `package.json`, and run `npm install --package-lock-only`
   so the lockfile matches.
2. **Update What's new:** in `src/data/changelog.ts`, give the release its entry with
   `version: "0.2.0"`, today's date and a title. Its items become the release notes, so make them say
   everything users will notice in this release.
3. **Check:** `npm test` and `npm run build`. A test fails if a What's new version is ahead of
   `package.json`. Merge these changes through a pull request as usual.
4. **Tag and push**, on `main` after the merge:
   ```bash
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```
5. **GitHub Release:** `npm run -s release-notes > release-notes.md` builds the notes from that What's
   new entry, plus links to the Jira keys of every commit since the previous tag. Then:
   ```bash
   gh release create v0.2.0 --title "v0.2.0" --notes-file release-notes.md
   ```
6. **Jira:** mark the version (`v0.2`) Released, with today's date, on the same day.

The app shows its version at the top of What's new (read from `package.json` at build time). To roll
back, check out the previous tag.
