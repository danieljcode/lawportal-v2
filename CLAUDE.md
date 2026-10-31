# Law portal (lawportal-v2)

How to work here: [docs/contributing.md](docs/contributing.md) (branches, commits, Definition of Done) and
[docs/development.md](docs/development.md). How the app fits together: [docs/architecture.md](docs/architecture.md).

## Project memory (LP-130)

If the Obsidian vault at `C:\Obsidian\Claude` is there, read its `CLAUDE.md` and `Projects/lawapp/lawapp.md` (and
`lawapp state`) before searching the code, and update the notes after a change, as part of the change. The vault keeps
what the repo can't (decisions, state, gotchas, session history); `docs/` stays the source of truth, and the notes
link to it rather than copy it.

## Layout

- `src/shell/`: the app shell (App, the program registry, routing, frames, home screens, the shell's dialogs).
- `src/programs/<id>/`: one folder per program. Other code imports a program only through its `index.ts`.
- `src/ui/`: components and hooks shared by the shell and programs.
- `src/lib/`: logic and stores, no React components; `src/data/`: forms, penal code, What's new.
- `tests/`: every Vitest suite; `e2e/`: the Playwright smoke tests.

`npm run lint` enforces the import rules (see "Code layout" in docs/architecture.md): no deep imports into a program,
no `../` out of one, and nothing in `src/lib` or `src/ui` importing the shell or a program. New code shared by two
programs goes in `src/ui/` or `src/lib/`.

## Direction: modern first

The modern look is the default and what new work is designed for (LP-125). Classic (1990) is an optional theme
(LP-112) that must keep working: build for Modern, then check Classic. The smoke and screenshot tests run both.

## Programs

The programs are one registry, `PROGRAMS` in `src/shell/registry.ts`: a new program is one entry there plus its folder.
Routes are prefixed by program (`src/shell/useRoute.ts`); an empty hash is home.

| Program                             | Folder                  | Routes                                       |
| ----------------------------------- | ----------------------- | -------------------------------------------- |
| Court Filings                       | `src/programs/filings/` | `#filings`, `#filings/<formId>`              |
| Case File                           | `src/programs/cases/`   | `#cases`, `#cases/<id>`, `#cases/upcoming`   |
| Clients                             | `src/programs/clients/` | `#clients/intake`, `#clients/conflicts`      |
| Law Library                         | `src/programs/library/` | `#library/penal-code`, `#library/precedents` |
| Ledger                              | `src/programs/ledger/`  | `#ledger`                                    |
| J.A.P. (Court Commissioners)        | `src/programs/jap/`     | `#jap`                                       |
| Settings (Control Panel in Classic) | `src/programs/control/` | `#control`                                   |

Home is `src/shell/ModernHome.tsx` in Modern and `src/shell/ProgramManager.tsx` in Classic.

Unfinished work can merge behind a feature flag (`src/lib/flags.ts`, on with `?flags=<name>`; docs/development.md).
Flagged work is done only when its feature ships and the flag, with every check of it, is deleted.

## Themes

- `html[data-look]` (`modern` or `classic`) and `html[data-theme]` (`light`, `dark`, or absent for system) are
  separate, both set before the first paint by `THEME_SCRIPT` (`src/lib/theme.ts`).
- What differs between looks is a variable in `src/app/globals.css`. `data-look` rules hold only variables, and a
  program's stylesheet (`src/programs/<id>/<id>.css`) uses only variables, never hard-coded colours, fonts, font
  sizes, radii or bevels. `tests/stylesheets.test.ts` checks both.
- The forum preview (`.post`), the Discord message and the print sheets keep fixed looks in every theme, and court
  forms never carry firm branding.
- A change that moves a screen fails the screenshot tests; take the new ones with `npm run screenshots:accept`
  (docs/testing.md).
