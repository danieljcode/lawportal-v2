// What every program gets from the shell (LP-103): where it is, who's filing,
// and the shell's dialogs and settings. A program draws its own panes inside
// the window; the title bar, menu bar and taskbar are the shell's.

import type { Filing } from "@/lib/filings";
import type { SyncState } from "@/lib/sync";
import type { ShellMode } from "@/lib/shell";
import type { ThemeMode } from "@/lib/theme";
import type { Character, FormInfo } from "@/lib/types";
import type { DocketRequest, DraftRequest, FormTools } from "@/programs/filings";
import type { Route } from "./useRoute";

export interface Shell {
  route: Route;
  /** The open form (Court Filings), or null. */
  form: FormInfo | null;
  characters: Character[];
  /** The active character, the same in every program. */
  active: Character | null;
  /** The active character is a Court Commissioner (the J.A.P.). */
  commissioner: boolean;
  /** The program's navigation pane is open (a drawer at phone width). */
  navOpen: boolean;
  syncOn: boolean;
  syncState: SyncState;
  /** Dockets "Use in form" for the open form. */
  docketRequest: DocketRequest | null;
  /** Filing history's "Use as new draft" for the open form (LP-15). */
  draftRequest: DraftRequest | null;
  /** The open form shows its docket bar. */
  onDocketBar(on: boolean): void;
  /** The open form's filing tools, for Court Filings' Form menu (LP-105). */
  onFormTools(tools: FormTools | null): void;
  openCharacters(startSync?: boolean): void;
  openFilings(): void;
  /** Open a filing as a new draft of its form. */
  openFiling(f: Filing): void;
  /** Open a form with a case's details, and any more fields by label, filled in. */
  openFormForCase(formId: string, caseId: string, values?: Record<string, string>): void;
  openChangelog(): void;
  openAbout(): void;
  /** The Dockets dialog for a character (Settings' character list, LP-109). */
  openDockets(charId: string): void;
  /** Settings showed What's new: clear its unread dot. */
  markChangelogSeen(): void;
  /** Light, dark or system, separate from the theme. */
  theme: ThemeMode;
  setTheme(mode: ThemeMode): void;
  /** The theme (LP-112): Modern or Classic, which picks the frame round the programs (LP-125) and the look. */
  layout: ShellMode;
  setLayout(mode: ShellMode): void;
  /** This program is the one showing; false while it's kept, hidden, for coming back to (LP-126). */
  visible: boolean;
}

export interface ProgramProps {
  shell: Shell;
}
