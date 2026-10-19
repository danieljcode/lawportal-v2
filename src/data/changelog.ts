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
