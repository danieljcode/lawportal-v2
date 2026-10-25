# Law portal (lawportal-v2)

How to work here: [docs/contributing.md](docs/contributing.md) (branches, commits, Definition of Done) and
[docs/development.md](docs/development.md). How the app fits together: [docs/architecture.md](docs/architecture.md).

## Layout

- `src/shell/`: the app shell (App, the program registry, routing, frames, home screens, the shell's dialogs).
- `src/programs/<id>/`: one folder per program. Other code imports a program only through its `index.ts`.
- `src/ui/`: components and hooks shared by the shell and programs.
- `src/lib/`: logic and stores, no React components; `src/data/`: forms, penal code, What's new.
- `tests/`: every Vitest suite; `e2e/`: the Playwright smoke tests.

`npm run lint` enforces the import rules (see "Code layout" in docs/architecture.md): no deep imports into a program,
no `../` out of one, and nothing in `src/lib` or `src/ui` importing the shell or a program. New code shared by two
programs goes in `src/ui/` or `src/lib/`.
