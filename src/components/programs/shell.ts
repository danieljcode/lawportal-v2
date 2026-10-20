// What every program gets from the shell (LP-103): where it is, who's filing,
// and the shell's dialogs and settings. A program draws its own panes inside
// the window; the title bar, menu bar and taskbar are the shell's.

import type { Filing } from "@/lib/filings";
import type { SyncState } from "@/lib/sync";
import type { ThemeMode } from "@/lib/theme";
import type { Character, FormDef } from "@/lib/types";
import type { DocketRequest, DraftRequest } from "../FormView";
import type { Route } from "../useRoute";

export interface Shell {
  route: Route;
  /** The open form (Court Filings), or null. */
  form: FormDef | null;
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
  openCharacters(startSync?: boolean): void;
  openFilings(): void;
  /** Open a filing as a new draft of its form. */
  openFiling(f: Filing): void;
  openChangelog(): void;
  openAbout(): void;
  theme: ThemeMode;
  setTheme(mode: ThemeMode): void;
}

export interface ProgramProps {
  shell: Shell;
}
