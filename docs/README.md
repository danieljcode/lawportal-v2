# Developer documentation

How the Court Filing Generator's code works, for anyone working on it. For what the app does, see
the [main README](../README.md).

| Doc                                           | Read it for                                                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Development](development.md)                 | Setting up a fresh clone, running the app (including on your LAN), every npm script, environment variables, common problems.                                            |
| [Architecture](architecture.md)               | The big picture: client-only Next.js app, hash routing, the stores, the API routes and host check, and how a filing flows from form to forum, BBCode, Discord and Word. |
| [Templates and forms](templates-and-forms.md) | The `{{token}}` syntax, escaping, the template-safety check, adding a form, court settings, regenerating the court forms, the reference data.                           |
| [Sync, storage and recovery](sync.md)         | Sync codes, server storage, how conflicts are merged, how damaged saved data is kept.                                                                                   |
| [Testing](testing.md)                         | The test suites, what the XSS test protects, snapshots, parity tests, CI, the Playwright scripts.                                                                       |
| [Contributing](contributing.md)               | How we work: Jira, branches, commit and PR conventions, the Definition of Done.                                                                                         |
| [Releasing](releasing.md)                     | Shipping a version: version bump, What's new, tag, GitHub Release, Jira.                                                                                                |
| [Dependencies](dependencies.md)               | Dependabot update PRs and how to handle them, the security audit in CI, the current npm overrides.                                                                      |

`screenshots/` holds the images used in the main README.
