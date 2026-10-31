# How we work

This is a personal project, and the code is not open for reuse (see [LICENSE](../LICENSE)). These are
the conventions for anyone working on it with Daniel. Planning lives in the Jira project **LP**
("Law portal"), which is private.

## Issue keys

Every issue has one ID: its Jira key, for example `LP-64`. Branches, commits and pull requests carry
it so each change can be traced back to its issue.

- **Branch:** starts with the key, then a short description: `LP-64-merge-sync-conflicts`
- **Commit:** `<type>(<area>): <summary> [LP-<n>]`, for example
  `fix(sync): merge conflicts per character [LP-64]`
  - type: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`, `style` or `perf`. The type
    decides where the commit lands in `CHANGELOG.md` (LP-116): `feat`, `fix`, `perf` and `docs` are
    listed there, the rest are left out. See [Releasing](releasing.md).
  - area: the issue's area label (see Labels)
  - summary: imperative ("add", not "added"), lowercase, no full stop; the whole line is at most
    72 characters, including the key
  - body (optional): a blank line, then why the change was made, wrapped at 72, in British English
  - one logical change per commit; keep tests with the code they cover
- **Pull request title:** the same format as a commit.
- **Pull request description:** starts with a link to the Jira issue, for example
  `Jira: LP-64`, then a short summary of
  what changed and how it was tested.

Nothing is pushed or merged to `main` directly: every change goes through a pull request, and Daniel
reviews and merges.

### Checked automatically (LP-84)

- **Before each commit:** `npm install` points git at `.githooks/`, whose `commit-msg` hook rejects a
  message that doesn't follow the format and says what's wrong, with an example.
- **On every pull request:** the Conventions workflow (`.github/workflows/conventions.yml`) checks
  every commit in the PR and the PR title, so commits made without the hook are caught too. It
  re-runs when the title is edited.
- **New pull requests** open with `.github/pull_request_template.md`: the Jira link, What changed,
  How it was tested and the Definition of Done.
- Allowed as they are: GitHub's `Merge pull request …` commits, `Revert "…"` commits, local
  `fixup!`/`squash!` commits, and dependency updates (`chore(deps): …`, `chore(deps-dev): …`,
  `ci(deps): …`), which have no Jira key, and the Release PR that release-please opens (LP-116),
  titled like `chore(main): release 0.3.0`.
- The checker is `scripts/commit-format.mjs`. To check a message by hand:
  `node scripts/commit-format.mjs --file <file>`, or a PR title with
  `PR_TITLE="…" node scripts/commit-format.mjs --title`.

## Working on an issue

1. **Pick one issue at a time** from the top of the board: To Do, then Backlog, in rank order.
   Skip anything flagged or labelled `blocked`. Before starting a `size-l` issue, split it into
   smaller issues in Jira first.
2. **Move it to In Progress** and make its branch from an up-to-date `main`.
3. **Make the change** with its tests, and run `npm test`, `npm run lint`, `npm run format:check` and `npm run build`.
4. **Open a pull request** (title and description as above). CI must be green.
5. **After Daniel merges**, update local `main` before anything else:
   ```bash
   git checkout main
   git fetch origin
   git merge --ff-only origin/main
   git status -sb    # must not say "behind"
   ```
6. **Move the issue to Done** with a short comment on what changed and how it was tested.

## Issue types

- **Bug:** something broken that should already work
- **Improvement:** refactors, tooling, docs, migrations
- **Story:** a new feature
- **Task:** a research spike or a one-off job
- **Epic:** a group of issues; it's Done when its children are

## Labels

- **Priority:** `p1` do now, `p2` next, `p3` later
- **Size:** `size-s` up to half a day, `size-m` 1–2 days, `size-l` 3+ days (split it before starting)
- **`blocked`:** waiting on something outside the code. Blocked issues are also flagged and say why
  at the top of the description.
- **One area label per issue**, for example `sync`, `forms`, `cases`, `branding`, `hosting`

## Releases (Fix version)

- v0.2 Stable & focused
- v0.3 Firm tools
- v0.4 1990 desktop
- v1.0 Hosted firm
- No Fix version: unscheduled ideas

A version ships when all its issues are Done. Then it's tagged in Git, gets a GitHub Release, and the
Jira version is marked Released: see [Releasing](releasing.md). Since LP-116, merging release-please's
Release PR does the tag and the GitHub Release.

## Board columns

- **Backlog:** everything planned, ranked in the order it should be picked up
- **To Do:** the current release only. When it's empty, pull from the top of Backlog.
- **In Progress:** one or two issues at a time, so work actually finishes
- **Done:** finished, and meets the Definition of Done

## Definition of Done (every issue)

- [ ] Acceptance criteria met
- [ ] Tests added or updated, all passing, CI green
- [ ] What's new entry (`src/data/changelog.ts`) if users will notice the change
- [ ] README/docs updated if setup or behaviour changed
- [ ] Help updated for user-facing changes (LP-94): the topic in `src/programs/help/topics/` that
      covers it, or a new topic listed in `topics.ts`
- [ ] Branch starts with the issue key; commits and PR title end with `[LP-<n>]`; PR description
      links the Jira issue
- [ ] Flagged work (LP-120): when the feature ships, its flag and every check of it are deleted

Before calling a change done, run `npm test`, `npm run lint`, `npm run format:check` and `npm run build`. The parity tests also need the
reference data (see [Templates and forms](templates-and-forms.md#reference-data)).

## Weekly grooming (10 minutes)

Refill To Do from the top of Backlog, clear flags and `blocked` labels that no longer apply,
re-check sizes, and close anything we've decided against.
