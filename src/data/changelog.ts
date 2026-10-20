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
        text: "The Law Library now has the FreestyleRP penal code: every charge with its class, sentence, fine and description, and when the code was last updated. It's the revised draft, so it may still change.",
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
  { date: "2026-10-19", title: "Stable & FreestyleRP", version: "0.2.0", items: [
    { type: "update", text: "The app is now just for FreestyleRP: FreestyleRP court names in every form, the Superior Court in case numbers (for example 90SCCR00XXX), in-game 1990 dates throughout, and no more Server switch." },
    { type: "fix", text: "When two devices change things before syncing, your unsent edits are no longer lost: the newest copy of each character wins, and your version is kept so you can use Restore my version." },
    { type: "fix", text: "Saved data that can't be read is set aside instead of deleted, and Download damaged data in the Characters dialog gives you a copy to fix by hand." },
    { type: "new", text: "What's new shows which version of the app you're using." },
  ]},
  { date: "2026-10-16", title: "FreestyleRP only", items: [
    { type: "update", text: "The app is now just for FreestyleRP: the Server switch is gone from the toolbar and from characters, and every form uses the in-game year (1990)." },
    { type: "fix", text: "J.A.P. case-number examples now use the Superior Court format (XXSCCR00000) instead of the old GTAW one." },
  ]},
  { date: "2026-10-16", title: "FreestyleRP forms", items: [
    { type: "update", text: "Every court form is now written in FreestyleRP's court names, so what you see in the editor is exactly what gets posted." },
    { type: "update", text: "The Courthouse box offers Superior Court, and the Greg E. Joplin courthouse is gone from every form." },
  ]},
  { date: "2026-10-16", title: "FreestyleRP case numbers", items: [
    { type: "update", text: "Case numbers now name the Superior Court, for example 90SCCR00XXX, instead of the old GTAW courthouses. Case numbers already on your dockets stay as they were filed." },
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
    { type: "new", text: "Case number inputs now start empty and show the server-aware pattern as a greyed-out placeholder; GTAW keeps GJ, FreestyleRP drops it." },
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
