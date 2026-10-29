---
name: lp-ship
description:
  Ship the current change for a Jira LP issue the way docs/contributing.md says - run the four checks, commit in the
  house format, push the issue branch, open the pull request with the Jira link, and update the issue. Use when the
  user runs /lp-ship LP-<n>.
argument-hint: LP-<n>
disable-model-invocation: true
---

# Ship an LP issue

Ships the work in the checkout for the issue in `$ARGUMENTS` (for example `LP-128`). The rules come from
[docs/contributing.md](../../../docs/contributing.md); if this file and that one disagree, the doc wins.

Stop and tell the user, rather than working around it, if any step below fails.

## 1. Know the issue

- `$ARGUMENTS` must be a key like `LP-128`. If it's missing or malformed, ask for it.
- If Jira tools are available, read the issue: its summary, its **area label** (one per issue, for example `sync`,
  `forms`, `cases`, `branding`, `hosting`), its type and its acceptance criteria. Without Jira, ask the user for the
  area.
- Never push or merge to `main`. Daniel reviews and merges every pull request.

## 2. Be on the issue's branch

- The branch must start with the key, then a short description: `LP-128-short-description`.
- On `main`, or on a branch without the key: make the branch from an up-to-date `main` and carry the changes over
  (`git switch -c LP-128-…`). If the branch already exists with other work on it, ask first.
- Run `git status` and `git diff` and read what will be shipped. Leave out anything unrelated to the issue and say so.
- On Windows, snapshot files can show as changed only because of line endings. If
  `git diff --ignore-cr-at-eol tests/__snapshots__` is empty, put them back with `git checkout -- tests/__snapshots__`.

## 3. Run the four checks

Run each and stop on the first failure, showing its output:

```bash
npm test
npm run lint
npm run format:check
npm run build
```

- A format failure: run `npm run format`, check the diff only touched formatting, then run `format:check` again.
- Never loosen a test, the escaping, `--max-warnings 0` or a snapshot just to get green. `tests/xss.test.ts` in
  particular must never be relaxed.
- If the parity suites skipped because `.agents/reference/jsa` isn't there, say so in "How it was tested".

## 4. Check the Definition of Done

Before committing, confirm each, and fix or ask about any that aren't met:

- the issue's acceptance criteria are met;
- tests were added or updated with the code they cover;
- a "What's new" entry in `src/data/changelog.ts` (newest first, today's real date as `YYYY-MM-DD`, types `new`,
  `update` or `fix`) if users will notice the change;
- the README or `docs/` are updated if setup or behaviour changed.

## 5. Commit

- Header: `<type>(<area>): <summary> [LP-<n>]`
  - type: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`, `style` or `perf` (Story → usually `feat`, Bug
    → `fix`)
  - area: the issue's area label, lowercase
  - summary: imperative, lowercase, no full stop
  - the whole header is at most 72 characters, key included
- Body (optional): a blank line, then why the change was made, wrapped at 72, in British English.
- One logical change per commit. If the diff holds several, make several commits, each carrying the key.
- End the message with the co-author line the session's attribution instructions give.
- Check the header before committing: write it to a file and run `node scripts/commit-format.mjs --file <file>`. The
  `commit-msg` hook checks it too; if the hook rejects it, fix the message, never `--no-verify`.

## 6. Push and open the pull request

- `git push -u origin <branch>`.
- Title: the same format as a commit (usually the main commit's header).
- Description, following `.github/pull_request_template.md`:

  ```markdown
  Jira: LP-128

  ## What changed

  - …

  ## How it was tested

  - `npm test`, `npm run lint`, `npm run format:check` and `npm run build` pass
  - …

  ## Definition of Done

  - [x] Acceptance criteria in the Jira issue met
  - [x] Tests added or updated, all passing, CI green
  - [ ] What's new entry if users will notice the change
  - [ ] README/docs updated if setup or behaviour changed
  - [x] Branch starts with the issue key; commits and PR title end with `[LP-<n>]`; PR description links the Jira issue
  ```

  Tick only what's true, and leave "CI green" unticked until CI has passed. End the description with the attribution
  line the session's instructions give.

- Open it with `gh pr create --title "…" --body-file <file>` against `main`.

## 7. Update Jira

- If the issue isn't In Progress yet, move it there.
- Don't move it to Done: that happens after Daniel merges. Tell the user that once it's merged, the issue goes to
  Done with a short comment on what changed and how it was tested, and local `main` gets updated with
  `git merge --ff-only origin/main`.
- Without Jira tools, tell the user which moves to make by hand.

## 8. Report

Give the PR link, the branch, the commits, the result of each check, and anything left unticked or skipped.
