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
