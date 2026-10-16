# Court Filing Generator

[![CI](https://github.com/danieljcode/lawportal-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/danieljcode/lawportal-v2/actions/workflows/ci.yml)

A personal, local web app for writing San Andreas court filings. Pick a form, fill in the fields, and
copy the finished filing straight into a forum editor (as formatted HTML or as BBCode), or download it
as a Word `.docx`.

It carries 39 court forms plus six of our own templates (petitions, a motion, discovery and a
contract), and it looks like a 1990s Windows desktop.

> Personal tool. These are roleplay court forms, not legal documents. Always check a filing before
> posting.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. For a production build:

```bash
npm run build
npm start
```

Both bind to `127.0.0.1`, so only this computer can reach the app.

### Other devices on your network

```bash
npm run build && npm run start:lan
```

This binds to `0.0.0.0` and prints `LAN mode: the app and its sync API are reachable from your network.`
Open `http://<this computer's LAN IP>:3000` on the other device. Notes:

- For other devices prefer `npm run build && npm run start:lan`. `npm run dev:lan` works too, but
  `next dev` warns about cross-origin dev requests from other devices.
- Copy uses a fallback over plain http on the LAN: `http://<LAN IP>` isn't a secure context, so the
  browser's clipboard API is unavailable and the app copies through a text selection instead.
- Without a `:lan` script, every API request that doesn't arrive on `localhost`/`127.0.0.1` gets
  `421`. This also blocks DNS-rebinding pages from reaching the local API.

## Features

- **Form catalogue.** 39 court forms in their court groups (Criminal, Civil, Traffic, Appellate,
  Supreme, Miscellaneous, Small Claims), then **Additional Templates**: General Petition, Petition for
  Name Change, General Motion, Interrogatories, Subpoena and Service Agreement.
- **Sidebar.** Search by title, court or section; collapsible court groups with section labels; a
  Court Commissioners group with the J.A.P. when a commissioner is the active character.
- **Start page** with the three steps (add your character, fill in the form, copy for forum).
- **Form editor.** Inputs generated from the template: collapsible sections with "x of y filled"
  counts, checkbox lists with inline details, repeatable items (add, remove, reorder), optional
  sections, dates with Today/Auto. Case number boxes start empty and show the server-aware pattern as
  a placeholder (GTAW keeps the GJ code, FreestyleRP drops it); leaving one blank still prints the
  pattern in the output. Collapse all, Fill from character and Clear form. Drafts save automatically
  per form and the last form reopens on load.
- **Toolbar.** "Filing as" (the active character), the server toggle, Dockets, J.A.P., Characters with
  a sync status dot, What's new with an unread dot, the theme button, and a ☰ form list on narrow
  screens.
- **Server toggle.** Switch between GTAW and FreestyleRP. FreestyleRP shifts dates back 36 years (so a
  real 2026 reads as 1990, 2027 as 1991) and renames the courts to generic "San Andreas" ones in the
  sidebar, breadcrumb and every filing. Each character remembers its server; with no character active
  the choice is saved as the default.
- **Forum preview.** A live, always-light preview with Highlight unfilled; Preview, BBCode and
  Discord tabs; **Copy for forum** (HTML that keeps tables, with BBCode as plain text), **Copy
  BBCode**, and **Download .docx**.
- **Discord output.** The Discord tab turns the filing into Discord markdown (headings from font
  sizes, bold/italic/underline/strike, lists, links, spoilers; user text is escaped so it never
  formats or pings) and splits it into messages of at most 2,000 characters, or 4,000 with Nitro,
  counted in UTF-16 units like Discord. Splits prefer headings, then paragraphs, then lines, then
  sentences, and never land inside formatting, a link, a spoiler or a code block (long code blocks
  are closed and reopened). Each part has a dark Discord-style preview, a Raw view, its character
  count and its own Copy button; optional `-# Part i/n` markers count toward the limit. Tables (the
  court caption) render as a fixed-width code block or as plain lines. The settings are stored per
  browser under `lawapp_discord`. Discord has no colours, alignment or tables, so those are dropped;
  the J.A.P. output stays BBCode only.
- **Characters.** Name, title, date of birth, gender, phone, address, occupation, bar/badge number,
  email, signature, notes and "Keeps a docket". Use, edit, duplicate, reorder and delete (which also
  deletes the character's docket and J.A.P.). Export and import a JSON file (`lawapp-characters.json`)
  that includes dockets and J.A.P. portfolios; older exports still import.
- **Dockets** for judges and lawyers: a case list per character with search, a status filter, New,
  Edit, Close case and Delete. On any form with a case number, the docket bar loads a case into the
  form or saves the form's case to the docket, and the Dockets dialog's "Use in form" does the same.
- **Judicial Advancement Portfolio (J.A.P.)** for characters titled Court Commissioner I or II: the
  CC I and CC II task lists (kept separately), progress counts, docket autofill of case names and
  links, and the finished BBCode with its topic title, ready to copy.
- **Sync** across browsers and devices through this app's own server (see below).
- **What's new** with this app's own changelog.
- **Themes.** Automatic, light (classic Windows grey) and dark (High Contrast Black), applied before
  the page paints. The forum preview always stays light.

Data lives in this browser's local storage (keys prefixed `lawapp_`). The "Today" date buttons and
date prefills use UTC, like the forum's courts.

## Sync and security

Sync is optional and runs entirely on the computer that runs the app:

- "Turn on sync" in the Characters dialog creates a private sync code (`JSA-XXXX-XXXX-XXXX-XXXX-XXXX`).
  Your characters, dockets and J.A.P. portfolios are stored in `data/sync/` on this machine, in a file
  named after a SHA-256 hash of the code. Enter the code in another browser with "Use code".
- There are no accounts or passwords. The code is the only key: anyone with the code who can reach
  the server can read or change that data.
- With the `:lan` scripts the server is exposed to your network, traffic is plain http (no TLS), and
  there is no rate limiting. Only use `:lan` on a network you trust.
- "Stop syncing on this device" keeps the local copy. "Delete server copy" removes the file from
  `data/sync/`; every device using that code stops syncing.

## .docx export

"Download .docx" converts the final HTML on the server (`/api/docx`). The file opens in Word,
LibreOffice and Pages, and Google Drive converts it to a Google Doc when you upload it. It keeps
tables, alignment, bold/italic/underline/strike, sizes, colours, fonts, lists, rules, bordered boxes
and links. It's faithful enough to edit, not pixel-perfect: images become `[Image: <url>]` links (the
server never downloads them), and unfilled fields keep their placeholder text.

## Adding a form

Add a `FormDef` to `src/data/extra-forms.ts`:

```ts
{
  id: "extra-my-form",              // lowercase, unique
  court: "Additional Templates",
  section: "Motions",               // sidebar sub-label
  title: "My Form",
  html: `<p><strong>{{Court|SUPERIOR COURT OF SAN ANDREAS}}</strong></p>
<p>Case No. {{Case number|XXX}}</p>
<p>{{Body:paras|Text of the motion.}}</p>
<p>{{Filing date=today:date:long}}<br>{{@name|Your name}}, Bar No. {{@bar|__________}}</p>`,
}
```

The template is the forum post's own HTML with `{{tokens}}`:

| Token | Meaning |
|---|---|
| `{{Label}}` | A text field. Fields with the same label share one value. |
| `{{Label\|fallback}}` | Fallback HTML shown while the field is empty. |
| `{{Label:type}}` | Type: `text`, `textarea`, `date`, `number`, `select`, `check`, `spoiler`, `image`, `url`, `list`, `paras`. |
| `{{Label:select:A;B;C}}` | Options (select), the on/off text (check), a date format (`long`, `short`, `us`, `dmy`…), a list wrap tag or a paragraph style. |
| `{{Label=prefill}}` | A prefill: `today`, `today+21`, `<Other label>-2` for dates; `YY` and `<Division?CRIMINAL DIVISION=CR;…>` for text. |
| `{{@name}}` / `{{Label@title}}` | Filled from the active character (`name`, `title`, `dob`, `gender`, `phone`, `address`, `occupation`, `bar`, `email`, `signature`). |
| `{{Label>strong}}` | Wraps a filled value in a tag. |
| `{{#Items\|3}} … {{/Items}}` | A repeatable block (default 1 item). |
| `{{?Optional\|off}} … {{/Optional}}` | An optional section (on unless `\|off`). |
| `{{$index}}` `{{$word}}` `{{$WORD}}` `{{$letter}}` `{{$roman}}` | The item's position inside a block. |
| `{{$roman after Items}}` | The numeral after a block's last item. |
| `{{-- Section name}}` | Starts a collapsible section in the editor. Renders nothing. |

A form with a field labelled exactly `Case number` gets the docket bar. Run `npm test` afterwards:
the template-safety, engine, BBCode and `.docx` suites cover every form.

## Updating the directory forms

```bash
npm run port-forms
```

This reads `.agents/reference/jsa/js_forms.data.js` and writes `src/data/forms.json`. Links to the
old forum hosts are unwrapped (the link text stays; see `scripts/scrub-links.mjs`). It refuses to
write if any template contains scripts, event handlers, non-http(s) links or other unsafe markup, and
lists the offending form ids. Run `npm test` afterwards.

## Tests

```bash
npm test                          # all suites (vitest)
npx vitest run tests/<file>       # one suite
npm run build                     # type-checks the app and the tests
npm run screenshots               # verify step: needs the app running and a Playwright browser
```

The suites cover the template engine and BBCode converter (differential tests against the reference
engine when `.agents/reference/jsa/` is present, plus snapshots), the Discord converter, splitter
and preview (`src/lib/discord.ts`, `src/lib/discordSplit.ts`, `src/lib/discordPreview.ts`: goldens
and message limits on every form), the form state and layout, the
stores, the sync API and client, the `.docx` converter, XSS escaping, template safety, and the UI
(form view, preview, dialogs, Discord tab, J.A.P.).

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test` and `npm run build` on Node 22 for every
push and pull request. CI has no `.agents/` folder, so the reference-engine differential tests are
skipped there and only run locally.

## Credits

Made by Dan.
