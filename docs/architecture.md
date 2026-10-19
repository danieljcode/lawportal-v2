# Architecture

The big picture: what runs where, where data lives, and how a filing gets from a form to the forum.

## Shape of the app

It's a Next.js 16 app (React 19, TypeScript, built with Turbopack) that runs almost entirely in the
browser.

- **One page, client only.** `src/app/page.tsx` renders `AppLoader`, which loads `App` with
  `ssr: false`. The app reads local storage on its first render, so it never renders on the server
  (no hydration mismatches).
- **Hash routing.** `#civil-complaint` opens a form, `#jap` the J.A.P., `#cases` the Case File and
  `#cases/<id>` one case in it (LP-101), an empty hash the start page. `useRoute` owns the route and remembers the last form under `lawapp_last_form`;
  `useDialogs` owns the open dialog; `App.tsx` owns the active character and the layout.
- **Three small API routes** on the same server, all behind a host check (see [Server](#server)):
  sync (`/api/account`, `/api/data`) and the `.docx` export (`/api/docx`).
- **Error boundaries** (`ErrorBoundary.tsx`, LP-88). One wraps the whole app in `AppLoader`; inside
  `App`, the form, the forum preview, the J.A.P. and its output, and each dialog have their own. A
  render error shows an "Application Error" box in that panel's place while the rest keeps working,
  with **Try again** (or **Close** for a dialog), **Reload**, **Download a backup of my data** (the
  LP-1 backup) and **Copy error details**. When the form breaks, its preview is hidden so nothing
  half-made can be copied. The details (`src/lib/crash.ts`) hold the version, where it broke, the
  browser, the error's name and message with quoted text and sync codes blanked out, and code
  locations only, so never a sync code or anything typed into a form. Add a boundary round any new
  major panel.

```
src/
  app/            page.tsx (client-only entry), layout.tsx, globals.css, api/{account,data,docx}
  components/     App shell (useRoute, useDialogs hooks), FormView, dialogs, output panes;
                  fields/ for the form editor inputs
  data/           forms.json (39 court forms, generated), extra-forms.ts (6 templates), changelog.ts
  lib/            the logic: template engine, converters, stores, sync, settings (see below)
  lib/template/   the template engine: parse, prefill, render, escape, plain (template.ts re-exports)
  lib/discord/    HTML → Discord markdown: model, escape, serialize, dom, builder, tables, convert
  lib/formState/  per-form state: state, update, rules, dockets, layout, drafts
  lib/services/   work spanning several stores (characters.ts: delete, duplicate, export, import)
  lib/server/     server-only: host guard, capped body reader, sync codes, file store
scripts/          port-forms, FreestyleRP wording, template safety, release notes, Playwright scripts
tests/            vitest suites, snapshots, the reference-data oracle
```

## From form to filing

Every output starts from one HTML string, so the forum preview, BBCode, Discord and Word all say
the same thing.

```mermaid
flowchart LR
  T["Form template<br/>(HTML with {{tokens}})"] -->|compile| Tree[Template tree]
  Tree -->|fields| Ed[Form editor]
  Ed -->|values| R[render]
  Tree --> R
  R --> H[Final HTML]
  H --> P[Forum preview<br/>and Copy for forum]
  H --> B[BBCode<br/>bbcode.ts]
  H --> D[Discord markdown<br/>discord.ts + discordSplit.ts]
  H --> W[".docx<br/>POST /api/docx → htmlToDocx.ts"]
```

1. **Template.** Each form (`src/data/forms.json`, `src/data/extra-forms.ts`) is the forum post's
   own HTML with `{{tokens}}` for the fields. See [Templates and forms](templates-and-forms.md).
2. **Compile and fields** (`src/lib/template/`, re-exported by `template.ts`). `compile()` parses the template into a tree;
   `fields()` lists the inputs. `FormView` turns those into the editor (`src/components/fields/`).
3. **Form state** (`src/lib/formState/`, re-exported by `formState.ts`). Values, prefills (dates, case numbers), filling from
   the active character and dockets, repeatable blocks. Drafts save per form under
   `lawapp_draft_<form id>`.
4. **Render.** `render(tree, values)` produces the final HTML. **Every user value goes through
   `escapeHtml`**, so typed text can never become markup; `tests/xss.test.ts` is the backstop. The
   result is typed `SafeHtml`, and every output below only accepts `SafeHtml`, so the compiler
   rejects HTML that didn't come from a renderer (LP-5, see
   [Templates and forms](templates-and-forms.md#safehtml-the-compiler-checks-it-too-lp-5)).
5. **Outputs**, all from that HTML:
   - **Forum:** the live preview, and Copy for forum (HTML that keeps tables, with BBCode as the
     plain-text fallback).
   - **BBCode** (`src/lib/bbcode.ts`) for editors that only take plain text.
   - **Discord** (`src/lib/discord/`, `discordSplit.ts`, `discordPreview.ts`): markdown split into
     messages of up to 2,000 characters (4,000 with Nitro), never inside formatting or a link.
   - **Word:** the browser posts the HTML to `/api/docx`, and `src/lib/docx/htmlToDocx.ts` builds
     the file on the server. Images become `[Image: <url>]` links; the server never fetches them.

**Dates are in-game.** FreestyleRP is set 36 years back. `src/lib/freestyle.ts` (`gameDate()`) gives
`FormView` its `now`, which feeds Today, Auto, date prefills and the case-number year. Courthouses,
court names and the case-number shape live in `src/lib/courts.ts`.

## Client data: the stores

Everything a user saves lives in the browser's local storage (keys start `lawapp_`):

| Store                             | File                                     | Keys                                 |
| --------------------------------- | ---------------------------------------- | ------------------------------------ |
| Characters                        | `src/lib/characters.ts`                  | `lawapp_chars`, `lawapp_active_char` |
| Cases (the firm's, LP-4)          | `src/lib/cases.ts`; `dockets.ts` (view)  | `lawapp_cases`                       |
| J.A.P. portfolios (per character) | `src/lib/portfolio.ts`                   | `lawapp_jap_<character id>`          |
| Form drafts                       | `src/lib/formState.ts`, `draftWriter.ts` | `lawapp_draft_<form id>`             |
| Draft history (LP-89)             | `src/lib/draftHistory.ts`                | `lawapp_history_<form id>`           |
| Sync state                        | `src/lib/sync.ts`                        | `lawapp_sync_*`                      |

- **KV wrapper** (`src/lib/storage.ts`). The stores never touch `localStorage` directly: they go
  through a small `KV` interface, so tests use `memoryKV()` and a browser that blocks storage falls
  back to memory. `readJson` sets aside values it can't parse instead of deleting them (see
  [Sync, storage and recovery](sync.md#damaged-data)).
- **Change channels and React.** Each store has a change channel with a version counter. The hooks
  in `src/components/useStore.ts` subscribe with `useSyncExternalStore`, so components re-read a
  store when its version moves.
- **Clean on the way in.** Every store runs input through a `clean()` function (trimmed strings,
  known fields only, valid ids), so imports, synced copies and old data can't put odd shapes into
  storage.
- **Stores don't import each other** (LP-3). Work that spans them goes through
  `src/lib/services/characters.ts`: `deleteCharacter` (the character and its J.A.P., and takes it
  off its cases),
  `duplicateCharacter`, and the characters export and import. The one link the other way is
  `touchCharacter` in `storage.ts`: a J.A.P. change bumps its character's `updatedAt` for
  the sync merge, without the stores importing each other.
- **The shared store base** (`src/lib/store.ts`, LP-2 and LP-99). `createStore<T>(kv, options)`
  handles one saved value: load, validate, save, the change channel and its version counter. The
  options are `key`, `version`, `validate`, `migrations` and `isEmpty` (a value saved as nothing).
  `createKeyedStore<T>` is the same for one value per id under a key prefix (with `prefix` and
  `isId` instead of `key`): each id is read, saved and upgraded on its own, with one change channel
  for the lot. All the data stores are built on them: characters and cases on `createStore`, the
  J.A.P. (`lawapp_jap_<id>`) and draft history on `createKeyedStore`, so none of
  them has its own load, save or change-channel code. (Characters keep a second channel for the
  active character, which isn't saved data.)
  - **Every value carries its schema version**, saved as `{"v": 2, "data": …}`. A bare value (saved
    before its store moved onto the base) reads as version 1; nothing saved is version 0.
  - **Migrations** are a list of steps, each `{ to, up(data, kv), after?(kv) }`. On load, the
    steps from the saved version up run in order. **Reads upgrade in memory and never write**, so
    old data shows correctly even before it's saved again.
  - **`migrate()`** saves the upgraded value and runs each step's `after` clean-up (removing an old
    key, say). It's a no-op once done. Data from a newer version is read as it is and never
    rewritten.
  - **Characters** are at version 2: step 1 brings in the old `lawapp.characters.v1` list when
    nothing's saved (this was `migrateLegacy`), and step 2 wraps the bare array.
  - **The J.A.P.** is at version 2 (LP-99): its only step wraps the bare portfolio.
  - **Cases** are at version 1 (LP-4): with nothing saved, the step turns the old per-character
    dockets (`lawapp_dockets_<id>`, bare or in the LP-99 envelope) into cases and removes those
    keys. Dockets saved before LP-69 keep their GTAW court names and GJ case numbers as filed.
  - **To change a store's shape**, bump its `version` and add a step whose `up` turns the old shape
    into the new one, with a test from the old version.
- **Cases belong to the firm** (`src/lib/cases.ts`, LP-4). A `Case` is the docket fields plus a
  `lead` character, other `assigned` characters, and `created`/`updated` times.
  - **The migration** makes one case per case number (any capitals): the character whose entry was
    updated most recently leads and the others are assigned. Fields come from that newest entry,
    with gaps filled from the others and differing notes kept together. Cases made this way get an
    id from their number (`c90sccr00147`), the same on every device.
  - **A deleted character** is taken off its cases, which stay; a case it led is left with
    `lead: null` (`needsLead`) for someone to take on.
  - **The Case File** (`CaseFileView.tsx`, LP-101) is the program for them: every firm case with
    its lead and others, a search (case number or party) and filters (status, "Needs a lead",
    character), and a case's details and who's on it. `filterCases` and `caseProblem` in
    `cases.ts` do the searching and the checks (a case number no other case has). Areas for linked
    filings, evidence and deadlines are empty until LP-15, LP-12 and LP-18. On a phone the open
    case replaces the list.
  - **Dockets are a view** (`dockets.ts`): a character's docket is the cases they lead or are
    assigned to, with the same `DocketStore` API the Dockets dialog, docket bar and J.A.P. use until
    the Case File program (LP-101, LP-100). Saving a number the firm already has puts the character
    on that case; removing one takes them off it, deleting it when nobody is left. The pure docket
    fields (`FIELDS`, `clean`, `divisionFor`…) live in `docketFields.ts`, so the two don't import
    each other.
- **Undo and draft history** (LP-89). FormView keeps its state in an `Undoable`
  (`src/lib/formState/undo.ts`): every change is an undo step, except that typing in one field
  with pauses under a second joins the last step. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work while the
  form (or nothing) has focus. Separately, `draftHistory.ts` keeps snapshots of each form's draft
  on the keyed store: at the session's first edit, then at most every 3 minutes while editing, and
  before Clear form or a restore. Each form keeps the last 20, and the oldest are dropped first if
  storage is full. They're in the full backup but not synced, like drafts.
- **Startup migrations** (`src/lib/migrations.ts`) run once per load, from `AppLoader` after App's
  code has loaded and before it first renders, never during render: each store's `migrate()`, then
  dropping the pre-FreestyleRP `server` field and `lawapp_server` key (LP-71).

## Server

The only server code is three route handlers and `src/lib/server/`:

| Route          | Methods                                                     | What it does  |
| -------------- | ----------------------------------------------------------- | ------------- |
| `/api/account` | `POST` creates a sync code; `DELETE` deletes its data       | Sync accounts |
| `/api/data`    | `GET` the copy; `PUT` replaces it (optimistic, by revision) | Sync data     |
| `/api/docx`    | `POST` HTML, returns a `.docx`                              | Word export   |

- **Host check** (`guard.ts`). Unless the app was started with `dev:lan` / `start:lan` (which set
  `LAWAPP_ALLOW_LAN=1`), every API route answers `421` to requests not addressed to `localhost` or
  `127.0.0.1`. That also stops DNS-rebinding pages reaching the local API.
- **Capped bodies** (`body.ts`). Route handlers have no built-in body limit, so they read through
  `readCapped`: 1 MB for sync data, 2 MB for `.docx`.
- **Rate limits** (`rateLimit.ts`). The sync routes answer `429` when an IP (or the server overall)
  makes too many codes, or an IP sends too many bad codes: see [Sync](sync.md#server-storage).
- **Sync storage** is one JSON file per sync code: see [Sync, storage and recovery](sync.md).

## Related

- [Development](development.md): setting up and running it.
- [Testing](testing.md): what the suites cover.
