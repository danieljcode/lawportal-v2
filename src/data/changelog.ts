// Our own "What's new" entries (design §D13), newest first.

export type ChangeType = "new" | "update" | "fix";

export interface ChangelogItem {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  title?: string;
  /** Set on a release's entry (`0.2.0`); its items are that release's GitHub Release notes. */
  version?: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-31",
    title: "Rolodex",
    items: [
      {
        type: "new",
        text: "The Rolodex, in Clients: one card for every client, judge, officer, attorney, witness and business the firm deals with, with their phone, address and notes. It syncs and is in your backups.",
      },
      {
        type: "new",
        text: "Link contacts to a case in a role (client, opposing party, witness…) from the case's Contacts section.",
      },
      {
        type: "new",
        text: "Party names in a filing have Pick from Rolodex, which fills in the name, and the address and phone where the form asks for them.",
      },
    ],
  },
  {
    date: "2026-10-29",
    title: "Letterhead",
    items: [
      {
        type: "new",
        text: "Firm letters open with the firm's letterhead: its name, address, phone and email. Set them once in Settings → Letterhead. Court forms never carry it.",
      },
      {
        type: "update",
        text: "The Classic (1990) desktop is the firm's navy instead of teal. High Contrast Black stays black.",
      },
      {
        type: "update",
        text: "Your work is saved in a bigger part of the browser's storage, so lots of cases, filings and drafts no longer fill it up. It moves over by itself the first time you open the app.",
      },
      {
        type: "fix",
        text: "New client intake empties itself once Open case has made the case, so pressing Open case again, or coming back to the intake later, no longer makes a second case for the same client.",
      },
      {
        type: "fix",
        text: "Case notes stop at 4,000 characters as you type, with a count once you're close, instead of losing the end when you save. The intake summary stops at 3,000, so all of it reaches the new case's notes.",
      },
      {
        type: "fix",
        text: "Date boxes show dates the app's way (Thu 29 Oct 1990), take a typed date, and open a calendar on today's game date. Its weekdays now match the rest of the app: 29 Oct 1990 sits under Thursday, as 29 Oct 2026 does.",
      },
    ],
  },
  {
    date: "2026-10-28",
    title: "Where things moved",
    items: [
      {
        type: "update",
        text: "Everything is now a program, opened from the home screen or the bar down the side: the court forms are in Court Filings, and the Case File, Clients, Law Library and J.A.P. each have their own.",
      },
      { type: "update", text: "Upcoming is inside the Case File, in its side pane." },
      { type: "update", text: "New client intake and the Conflict check are in Clients." },
      { type: "update", text: "The penal code and the firm's precedents are in the Law Library." },
      {
        type: "update",
        text: "Your characters, sync and backups, What's new and About are in Settings (the Control Panel in Classic). Characters are also in the File menu.",
      },
      {
        type: "update",
        text: "Light or dark, and the 1990 look (Theme → Classic (1990)), are in Settings → Appearance and the View menu.",
      },
    ],
  },
  {
    date: "2026-10-26",
    title: "The Classic (1990) theme",
    items: [
      {
        type: "new",
        text: "Settings → Appearance now has a Theme, Modern or Classic (1990), and a separate Light, Dark or System choice, so any pair works. Classic is the Windows 3.x office computer: the window and taskbar, the Program Manager, the Control Panel and the startup screen, with an optional readable font. Modern stays the default, and forms, previews and everything you copy are the same in both.",
      },
    ],
  },
  {
    date: "2026-10-25",
    title: "Jump to any program or form",
    items: [
      {
        type: "new",
        text: "Press Ctrl+K (Cmd+K on a Mac) or / and type a few letters to jump straight to a program, a section such as Upcoming or Precedents, or any court form. The arrow keys and Enter pick one, and Esc closes it. It's also in the View menu.",
      },
      {
        type: "new",
        text: "Settings: your characters, sync and backups, the theme and layout, What's new and About, all on one page (it's still the Control Panel in the Classic layout). The top bar now shows just who you're filing as, with a quick switch, and the sync status, which opens Settings. Characters, the theme, What's new and About are also in the File, View and Help menus.",
      },
      {
        type: "update",
        text: "A new modern look: a clear system font, more room in buttons and fields, soft corners and muted slate and brass colours, in light and dark. Choosing the Classic (1990) layout in Settings brings back the Windows 3.x look exactly as it was. Forum previews and everything you copy or download are unchanged.",
      },
      {
        type: "fix",
        text: "Sync no longer loses an edit made while it's saving, or a change to a ruling in the Law Library that another device changed too: yours is kept, and Restore my version brings it back.",
      },
      {
        type: "fix",
        text: "Ctrl+K no longer closes a dialog you're typing in (such as a new character) to open the jump box, so what you've typed stays.",
      },
      {
        type: "fix",
        text: "Game dates and times now follow New York time on every computer, with the year 36 back, so a filing, the Case File and Upcoming always agree on today's date, even late at night. Days show the real weekday: Sunday 25 October is Sun 25 Oct 1990.",
      },
      {
        type: "fix",
        text: "Filing history's preview, Copy again and a case's filings now show a blank case number as it was copied (such as 90SCCR00XXX), not the template's raw YYSCCR#####.",
      },
      {
        type: "fix",
        text: "In the Case File, adding, editing, moving or deleting an exhibit, or logging its custody, no longer throws away changes you've typed in the case's details and not saved yet.",
      },
      {
        type: "update",
        text: "If a program breaks, its error box now has Go home, so you can carry on in the rest of the app, and Copy error details says which page you were on.",
      },
      {
        type: "update",
        text: "The app opens faster: each program now loads the first time you open it, and the rest load in the background while you work.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "A home screen that shows what's next",
    items: [
      {
        type: "new",
        text: "Home now shows what needs your attention: deadlines due in the next 48 hours or overdue, your latest filings to open again, and the cases you worked on most recently, each one click away.",
      },
      {
        type: "update",
        text: "Programs are tiles on the home screen. The Classic layout keeps the Program Manager.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Programs keep their place",
    items: [
      {
        type: "new",
        text: "Switching programs keeps each one's place: the form you were filling in and where you'd scrolled to, your searches, the Law Library chapter and a half-typed intake are all still there when you come back.",
      },
      {
        type: "update",
        text: "The app rail and the home screen take you back to where you left each program. Filing as someone else starts the other programs afresh.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "A modern layout",
    items: [
      {
        type: "new",
        text: "A cleaner, modern layout: an app rail down the side switches programs (a bar along the bottom on a phone), and the top bar shows the program, its menus and who you're filing as.",
      },
      {
        type: "update",
        text: "Only the panes scroll now, never the whole page, so the menus and the character picker stay in view.",
      },
      {
        type: "new",
        text: "Prefer the 1990 look? Choose Classic layout in the Control Panel (or View in the menus) for the Windows 3.x window, taskbar and startup screen.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Law Library",
    items: [
      {
        type: "new",
        text: "The Law Library has a side pane: Penal Code, with each chapter listed under it, and Precedents. Every chapter has its own link.",
      },
      {
        type: "new",
        text: "Browse the penal code a chapter at a time, in section order or by title A to Z, as well as searching it.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Clients",
    items: [
      {
        type: "new",
        text: "The Clients program has a side pane with New client intake and Conflict check.",
      },
      {
        type: "update",
        text: "Run conflict check on the intake now opens the Conflict check with the client and the other side filled in, and what you typed in the intake is still there when you go back.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Case File",
    items: [
      {
        type: "new",
        text: "The Case File has its own side pane: All cases, Upcoming (with how many are due soon) and the case you have open. On a phone it's behind ☰.",
      },
      {
        type: "new",
        text: "New case from intake and Run conflict check take you straight to the Clients program.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Court Filings",
    items: [
      {
        type: "update",
        text: "Court Filings' list now shows court forms only: the Case File, Clients, Law Library and J.A.P. open from the Program Manager.",
      },
      {
        type: "new",
        text: "A Form menu with the filing tools: pick a case, open the form's case in the Case File, the Law Library, Draft history and Filing history.",
      },
      {
        type: "new",
        text: "When a case is loaded into a form, Open in Case File takes you straight to it.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Program Manager",
    items: [
      {
        type: "new",
        text: "The system now opens on a Program Manager: your programs as icons in two groups, Court Work and Main. Click one, or move with the arrow keys and press Enter.",
      },
      {
        type: "update",
        text: "Case File's icon shows a dot when something is due within 48 hours, and opens on Upcoming. The taskbar's Start button always brings you back here.",
      },
      {
        type: "update",
        text: "The how-to steps are now on Court Filings' first page, and the startup screen setting is in the Control Panel.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Programs",
    items: [
      {
        type: "new",
        text: "Each part of the system is now its own program, in its own window with File, View and Help menus: Court Filings, Case File, Clients (intake and conflict check), Law Library, J.A.P. and Control Panel.",
      },
      {
        type: "new",
        text: "Open a program from the taskbar's Start button. The character you're filing as is now in the taskbar, so it's the same whichever program you're in.",
      },
      {
        type: "update",
        text: "Links now name the program, e.g. #filings/civil-complaint or #clients/intake. Your saved links and the form that reopens when you start still work.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Friedman & Associates",
    items: [
      {
        type: "update",
        text: "The app is now the Friedman & Associates Court Filing System: the firm's name is in the window title, the browser tab and the toolbar.",
      },
      {
        type: "new",
        text: "Help (the ? button) → About shows who the system is licensed to, the version and the credits.",
      },
      {
        type: "update",
        text: "Filings you post stay exactly as before, with no firm branding, so they look official.",
      },
      {
        type: "fix",
        text: "After a reload, the browser tab shows the page you're on (e.g. Case File) again, not just the app's name.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Startup screen",
    items: [
      {
        type: "new",
        text: "The Friedman & Associates Office System now boots like a 1990 computer: a memory test, drive checks and C:\\>. It shows once per browser session, for under 2 seconds, while the app loads.",
      },
      {
        type: "new",
        text: "Press any key or click to skip it. To turn it off, untick “Show the startup screen” on the start page.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Penal code",
    items: [
      {
        type: "new",
        text: "The Law Library now has the server's penal code: every charge with its class, sentence, fine and description, and when the code was last updated. It's the revised draft, so it may still change.",
      },
      {
        type: "new",
        text: "Search by section number, keyword or title (matches are highlighted), filter by chapter or class, and copy a citation such as “PC 1001 Assault”.",
      },
      {
        type: "new",
        text: "In a form, Law Library → Penal Code → Insert citation puts the charge where your cursor was.",
      },
    ],
  },
  {
    date: "2026-10-21",
    title: "Law Library",
    items: [
      {
        type: "new",
        text: "Law Library (in the sidebar): keep the firm's precedents, with the case, court, date, judge, key holding, summary, forum link and topics.",
      },
      {
        type: "new",
        text: "Search by keyword, case number, judge or court (matches are highlighted), filter by topic, and copy a citation such as “Smith v. Jones, 90SCCV00123 (San Andreas Civil Court 1990)”.",
      },
      {
        type: "new",
        text: "In a form, click in a field, then Law Library and Insert citation to put the citation where your cursor was. Precedents sync and are in your full backup.",
      },
    ],
  },
  {
    date: "2026-10-20",
    title: "Chain of custody",
    items: [
      {
        type: "new",
        text: "Each exhibit has a chain-of-custody log: open Custody on an exhibit to record when it was received, reviewed, copied, filed or returned, by whom, with a note. Times are in-game (1990).",
      },
      {
        type: "new",
        text: "Entries can't be changed or removed, so the log holds up in court: correct a mistake with a new entry. Copy for filing puts the log on the clipboard as a numbered list, and Print prints just the log.",
      },
    ],
  },
  {
    date: "2026-10-20",
    title: "Exhibits in filings",
    items: [
      {
        type: "new",
        text: "Insert exhibit: in a form whose case number matches a case in the Case File, pick one of the case's exhibits under a text box to add a reference such as “Exhibit C (Dashcam footage)”.",
      },
      {
        type: "new",
        text: "References follow the exhibit: move it up or down, or rename it, and the filing shows its new letter and title.",
      },
      {
        type: "new",
        text: "General Motion and General Petition can add an Exhibits list of the case's evidence, with links. Tick Exhibit list to include it.",
      },
    ],
  },
  {
    date: "2026-10-20",
    title: "Evidence",
    items: [
      {
        type: "new",
        text: "Each case in the Case File has an Evidence area: add exhibits with a title, description, link (an image, video or document) and the date obtained.",
      },
      {
        type: "new",
        text: "Exhibits are lettered automatically (A, B, C…, then AA) and relettered when you move them up or down. Edit or delete them any time; they sync and are in your full backup.",
      },
    ],
  },
  {
    date: "2026-10-20",
    title: "Judge templates",
    items: [
      {
        type: "new",
        text: "Three new templates for judges under Additional Templates › Judge: Ruling on Motion (granted, denied or in part), Sentencing Order (custody, fine, restitution, community service, probation) and Warrant Decision (approve or deny a search or arrest warrant).",
      },
      {
        type: "new",
        text: "They sign as your character, and loading a case from the case bar fills in the court, case number and parties.",
      },
    ],
  },
  {
    date: "2026-10-20",
    title: "Firm letters",
    items: [
      {
        type: "new",
        text: "Four new templates under Additional Templates › Firm Letters: Engagement Letter, Retainer Agreement, Demand Letter and Letter of Representation.",
      },
      {
        type: "new",
        text: "Each signs off from your character and can load its case from the case bar. The retainer starts with fee defaults ($250 an hour, a $5,000 retainer, invoices due in 14 days) you can change, and the demand letter's deadline defaults to 14 days out.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Conflict check",
    items: [
      {
        type: "new",
        text: "Conflict check (in the sidebar) looks for a name, a person or a business, on both sides of every firm case and in the case notes. Capitals don't matter, and part of a name or initials still find it.",
      },
      {
        type: "new",
        text: "You get a clear verdict, each match's case, side, status and lead, and a short memo to copy or print. Every check is kept in a log that syncs, so the firm can show it was done.",
      },
      {
        type: "new",
        text: "New client intake has a Run conflict check button for the client and the opposing party.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "New client intake",
    items: [
      {
        type: "new",
        text: "New client intake (in the sidebar and the Case File) takes a new client's details, the matter and a summary in one form. Open case adds it to the Case File with the right court and parties, your character as lead and the intake in its notes.",
      },
      {
        type: "new",
        text: "Print client sheet prints the intake as a one-page sheet.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Deadlines and hearings",
    items: [
      {
        type: "new",
        text: "Cases in the Case File now hold deadlines and hearing dates with a note. Tick them off when they're done.",
      },
      {
        type: "new",
        text: "Add dates to case, in the case bar of a form, puts the form's dates on its case: a case schedule adds the whole timetable at once.",
      },
      {
        type: "new",
        text: "Upcoming lists the next 14 days on your character's cases, overdue first, and the Case File button shows a dot when something is due within 48 hours. Dates are in-game.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Filing history",
    items: [
      {
        type: "new",
        text: "Every filing you copy for the forum, as BBCode or for Discord, or download as .docx is now kept in Filing history (at the bottom of the preview), with its character, case number and time.",
      },
      {
        type: "new",
        text: "Search filings and filter them by character or case number, preview one, reopen it as a new draft, or copy it again. A case's filings also show on it in the Case File. The newest 150 are kept; they sync and are in your full backup.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Forms use the Case File",
    items: [
      {
        type: "update",
        text: "The case bar in forms now lists the firm's cases from the Case File, with your character's cases first, so you can load any firm case into a form.",
      },
      {
        type: "update",
        text: "Save to Case File updates the firm's case with that number (and puts your character on it), or adds a new case with you as lead.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Case File",
    items: [
      {
        type: "new",
        text: "The Case File (in the toolbar and the sidebar) lists every firm case with its lead and the other characters on it. Search by case number or party, and filter by status, by cases that need a lead, or by character.",
      },
      {
        type: "new",
        text: "Open a case to edit its parties, court, status, dates and notes, choose its lead and who else is working it, or add a new case. Space is ready for the case's filings, evidence and deadlines.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Cases belong to the firm",
    items: [
      {
        type: "update",
        text: "Docket cases now belong to the firm rather than to one character. Characters with the same case number on their dockets share one case, so an edit by one shows for the others. Your existing dockets were moved over with nothing lost.",
      },
      {
        type: "update",
        text: "Deleting a character keeps their cases: they're taken off them instead, and any case they led is kept for someone else to take on.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Undo and draft history",
    items: [
      {
        type: "new",
        text: "Undo and Redo buttons (or Ctrl+Z and Ctrl+Y) in every form. Typing a word or a line counts as one step, and Clear form can be undone too.",
      },
      {
        type: "new",
        text: "Draft history keeps earlier versions of each form's draft: one every few minutes while you edit, and one before Clear form. Pick a version to preview it, then restore it if you need it. The last 20 per form are kept, and they're in your full backup.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Crash screen",
    items: [
      {
        type: "new",
        text: "If part of the app ever breaks, you get an Application Error box in its place instead of a blank page, and the rest keeps working. It can reload, download a backup of your data, or copy error details to send us (without your sync code or anything you've typed).",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Required fields",
    items: [
      {
        type: "new",
        text: "Forms now mark the fields a filing needs, such as the case number, the parties and your signature, with a small Required tag until they're filled.",
      },
      {
        type: "new",
        text: "Copy for forum, Copy BBCode, the Discord copy buttons and Download .docx tell you first if any of those are still empty. Click a field in the list to go straight to it, or copy anyway.",
      },
    ],
  },
  {
    date: "2026-10-19",
    title: "Full backup",
    items: [
      {
        type: "new",
        text: "Back up everything in the Characters dialog saves one file with your characters, dockets, J.A.P., form drafts and settings. Restore backup shows what will change, then puts it all back.",
      },
      {
        type: "new",
        text: "If sync is off and you haven't made a backup for 30 days, the Characters dialog reminds you.",
      },
    ],
  },
  { date: "2026-10-19", title: "Stable & focused", version: "0.2.0", items: [
    { type: "update", text: "The app now serves one server: its court names in every form, the Superior Court in case numbers (for example 90SCCR00XXX), in-game 1990 dates throughout, and no more Server switch." },
    { type: "fix", text: "When two devices change things before syncing, your unsent edits are no longer lost: the newest copy of each character wins, and your version is kept so you can use Restore my version." },
    { type: "fix", text: "Saved data that can't be read is set aside instead of deleted, and Download damaged data in the Characters dialog gives you a copy to fix by hand." },
    { type: "new", text: "What's new shows which version of the app you're using." },
  ]},
  { date: "2026-10-16", title: "One server", items: [
    { type: "update", text: "The app now serves one server: the Server switch is gone from the toolbar and from characters, and every form uses the in-game year (1990)." },
    { type: "fix", text: "J.A.P. case-number examples now use the Superior Court format (XXSCCR00000) instead of the old one." },
  ]},
  { date: "2026-10-16", title: "Court wording", items: [
    { type: "update", text: "Every court form is now written in the server's court names, so what you see in the editor is exactly what gets posted." },
    { type: "update", text: "The Courthouse box offers Superior Court, and the Greg E. Joplin courthouse is gone from every form." },
  ]},
  { date: "2026-10-16", title: "Case numbers", items: [
    { type: "update", text: "Case numbers now name the Superior Court, for example 90SCCR00XXX, instead of the old courthouses. Case numbers already on your dockets stay as they were filed." },
    { type: "update", text: "Loading a case from a docket fills in Superior Court as the courthouse." },
  ]},
  { date: "2026-10-16", title: "Version number", items: [
    { type: "new", text: "What's new now shows which version of the app you're using, and each release's entry is marked with its version." },
  ]},
  { date: "2026-10-16", title: "Damaged data kept", items: [
    { type: "fix", text: "Saved data that can't be read is no longer deleted. It's set aside, a notice tells you, and Download damaged data in the Characters dialog gives you a copy to fix by hand." },
  ]},
  { date: "2026-10-16", title: "Safer sync", items: [
    { type: "fix", text: "When two devices change things before syncing, your unsent edits are no longer thrown away: each character keeps whichever copy was changed most recently, along with its dockets and J.A.P." },
    { type: "new", text: "If another device's newer copy replaces one of your edits, your version is kept and the sync panel offers Restore my version." },
  ]},
  { date: "2026-10-08", title: "Case-number placeholders", items: [
    { type: "new", text: "Case number inputs now start empty and show the server-aware pattern as a greyed-out placeholder." },
    { type: "update", text: "Leaving a case number blank still renders the correct pattern in all outputs (forum preview, BBCode, Discord, .docx)." },
  ]},
  { date: "2026-10-07", title: "Discord output", items: [
    { type: "new", text: "Discord tab: the filing as Discord markdown, split into messages of up to 2,000 characters (4,000 with Nitro), each with its own Copy button and character count." },
    { type: "new", text: "Dark Discord-style preview, part markers, and a choice of code-block or plain-line tables." },
  ]},
  { date: "2026-10-06", title: "Personal cleanup", items: [
    { type: "update", text: "Removed outside links and branding; credits now Dan." },
  ]},
  { date: "2026-10-05", title: "Court filings rework", items: [
    { type: "new", text: "All 39 court forms, grouped by court in a searchable sidebar." },
    { type: "new", text: "Live forum preview with Highlight unfilled, Copy for forum (keeps tables) and Copy BBCode." },
    { type: "new", text: "Characters dialog with active character, Fill from character, duplicate, reorder, export and import." },
    { type: "new", text: "Dockets for judges and lawyers, with Save to docket and load-a-case on any form that has a case number." },
    { type: "new", text: "Judicial Advancement Portfolio (J.A.P.) builder for Court Commissioners I and II." },
    { type: "new", text: "Sync across devices through this app's own local server, using a private sync code." },
    { type: "new", text: "A 1990s desktop look with classic and high-contrast themes." },
    { type: "update", text: "Our general petition, name change, motion, interrogatories, subpoena and service agreement templates now live under Additional Templates and use the same editor." },
    { type: "update", text: "Download .docx now works for every form, including the directory forms." },
  ]},
  { date: "2026-10-01", title: "First version", items: [
    { type: "new", text: "Eight hand-written templates with forum BBCode output and .docx download." },
    { type: "new", text: "Saved characters that auto-fill names, titles and contact details." },
  ]},
];
