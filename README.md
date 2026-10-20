# Court Filing Generator

[![CI](https://github.com/danieljcode/lawportal-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/danieljcode/lawportal-v2/actions/workflows/ci.yml)

A personal, local web app for writing San Andreas court filings on the **FreestyleRP** roleplay
server. Pick a form, fill in the fields, and copy the finished filing straight into a forum editor (as
formatted HTML or as BBCode), into Discord, or download it as a Word `.docx`.

It's set up as **Friedman & Associates: Court Filing System**, the firm's in-house system. The firm's
name, logo and colours live in one file, `src/branding.ts`. Filings posted to the forum carry no
firm branding.

It carries 39 court forms plus six of our own templates (petitions, a motion, discovery and a
contract), all in FreestyleRP's court names, and it looks like a 1990s Windows desktop. FreestyleRP
is set in 1990, so every date the app fills in is 36 years back from today's real date.

> Personal tool. These are roleplay court forms, not legal documents. Always check a filing before
> posting.

![A civil complaint being filled in, with the live forum preview beside it](docs/screenshots/form-light.png)

![The same complaint as Discord messages, in the dark theme](docs/screenshots/discord-dark.png)

## Running it

You need Node.js 22.6 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Only this computer can reach it. To use it from other devices on
your network, run `npm run build && npm run start:lan` instead (only on a network you trust).
[Development](docs/development.md) has the details.

## Features

- **Programs.** Each part of the office system is its own program, opened full-screen in a Windows
  3.x-style window with its own title bar and **File**, **View** and **Help** menus: **Court
  Filings**, **Case File**, **Clients**, **Law Library**, **J.A.P.** (Court Commissioners) and
  **Control Panel**. The home screen is a Windows 3.x **Program Manager**: groups of program icons
  (Case File's shows a dot when something is due within 48 hours), and **Start** always comes back
  to it. The character you're filing as is in the taskbar, so it's the same in every program. Links are by program (`#filings/<form>`,
  `#cases/<case>`, `#clients/intake`, `#library/penal-code`…); older links still work.
- **Startup screen.** Once per browser session, the Friedman & Associates Office System boots
  DOS-style (memory test, drive checks, `C:\>`) for under 2 seconds while the app loads. Any key or
  click skips it, and the Control Panel has a setting to turn it off.
- **Forms.** 39 court forms grouped by court (Criminal, Civil, Traffic, Small Claims, Appellate,
  Supreme, general), plus **Additional Templates**: General Petition, Petition for Name Change,
  General Motion, Interrogatories, Subpoena and Service Agreement, and **Firm Letters**: Engagement
  Letter, Retainer Agreement, Demand Letter and Letter of Representation, and **Judge** templates:
  Ruling on Motion, Sentencing Order and Warrant Decision. Search by title, court or
  section.
- **Court Filings.** The court forms only, grouped by court, with search. Its **Form** menu has the
  filing tools: pick a case, open the form's case in the Case File, the Law Library, Draft history
  and Filing history.
- **Form editor.** Inputs built from the form: collapsible sections with "x of y filled" counts,
  checkbox lists, repeatable items, optional sections, dates with Today/Auto. Case numbers show the
  pattern as a placeholder (in-game year, courthouse, division, number, e.g. `90SCCR00XXX`). Fill
  from character, Clear form; drafts save automatically and the last form reopens.
- **Output.** A live forum preview with Highlight unfilled; **Copy for forum** (keeps tables),
  **Copy BBCode**, **Download .docx** (opens in Word, LibreOffice, Pages and Google Docs).
- **Discord.** The filing as Discord markdown, split into messages of up to 2,000 characters (4,000
  with Nitro), each with a preview, a character count and its own Copy button.
- **Characters.** Name, title, contact details, bar number, signature and notes, used to fill forms.
  Export and import them (with dockets and J.A.P.) as `lawapp-characters.json`.
- **Case File** (a program; also the toolbar button): every firm case, with its lead and the other characters on
  it. Search by case number or party, filter by status or character, and open a case to edit its
  details and who's working it.
- **Conflict check** (in **Clients**): check a new client's name (and the other side's) against every firm
  case, with a clear verdict, the matches, and a memo to copy or print. Every check is logged.
- **Law Library** (a program): the FreestyleRP **penal code**, searchable by section number, keyword
  or title, with each charge's class, sentence, fine and description; and the firm's
  **precedents**: add rulings with the case, court, date, judge, key holding, summary, forum link
  and topics, then search them or filter by topic. Matches are highlighted. In a form, **Law
  Library** inserts a citation ("PC 1001 Assault", or a ruling) into the field you last clicked in.
- **New client intake** (in **Clients**, or from the Case File): take a new client's details and the matter in
  one form, then **Open case** creates the case with the intake in its notes. Print it as a one-page
  client sheet.
- **Evidence** on each case: exhibits with a title, description, link and date obtained, lettered
  automatically (A, B, C…) and relettered when you reorder them. **Insert exhibit** under a form's
  text boxes adds a reference such as "Exhibit C (Dashcam footage)" that follows the exhibit when it's
  moved, and General Motion and General Petition can list the case's exhibits. Each exhibit keeps a
  **chain of custody** (who received, reviewed, copied, filed or returned it, and when), which you
  can copy into a filing or print.
- **Deadlines and hearings** on each case, added by hand or from a form's dates (a case
  schedule fills in the whole timetable). **Upcoming** lists the next 14 days, overdue first, and
  the Case File button shows a dot when something is due within 48 hours.
- **Dockets** for judges and lawyers: the cases each character works. Any form with a case number
  can load a firm case (yours listed first) or save its case to the Case File. Cases belong to the firm, so characters
  with the same case number share it, and deleting a character keeps its cases.
- **Judicial Advancement Portfolio (J.A.P.)** for Court Commissioners I and II: task lists, progress,
  and the finished BBCode ready to copy.
- **Sync** across browsers and devices through this app's own server, with a private sync code.
- **What's new**, with the app's version. **Themes:** automatic, light and dark.

## Your data

- Everything is saved in **this browser's local storage**. Nothing leaves the computer unless you
  turn on sync.
- **Back up everything** (Characters dialog) saves one file with your characters, cases, J.A.P.,
  form drafts and settings; **Restore backup** puts it all back after showing what will change. If
  sync is off, the dialog reminds you when there's been no backup for 30 days.
- **Sync** stores your characters, cases and J.A.P. on the computer running the app, under a
  private code. Anyone with the code who can reach that computer can read or change them, so keep it
  private. If two devices change the same character, the newer change wins and the other is kept so
  you can restore it. The sync server limits how many codes can be made (5 an hour) and how many
  wrong codes one device can try, so others on your network can't fill it up.
- **Filing history** keeps every filing you copy or download (the newest 150), with search and
  filters. Reopen one as a new draft or copy it again; a case's filings also show in the Case File.
- **Undo and Redo** (or Ctrl+Z and Ctrl+Y) step back through your edits in a form, and **Draft
  history** keeps earlier versions of each form's draft (every few minutes, and before Clear form)
  that you can preview and restore.
- If saved data is ever damaged, it's **set aside rather than deleted**, and the Characters dialog
  offers **Download damaged data**.

[Sync, storage and recovery](docs/sync.md) explains how all of this works.

## Documentation

Developer documentation is in [`docs/`](docs/README.md): [development](docs/development.md),
[architecture](docs/architecture.md), [templates and forms](docs/templates-and-forms.md),
[sync](docs/sync.md), [testing](docs/testing.md), [contributing](docs/contributing.md) and
[releasing](docs/releasing.md).

## Credits

Made by Dan. All rights reserved: see [LICENSE](LICENSE), which also notes the third-party court
forms.
