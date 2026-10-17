# Releasing

How to ship a version (set up in LP-74).

Versions follow the Jira versions: Jira `v0.2` is `0.2.0` in `package.json`, tag `v0.2.0`. Release
when every issue in the Jira version is Done, from an up-to-date `main`:

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
