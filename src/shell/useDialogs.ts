// The app shell's dialogs (LP-7, from App.tsx): which one is open (one at a
// time), whose docket it shows, the J.A.P. "Turn on sync" start, the Dockets
// "Use in form" request, the What's new unread dot and the jump box (LP-128).

import { useCallback, useState } from "react";
import { isUnread, markSeen } from "@/lib/changelog";
import type { DocketRequest } from "@/programs/filings";

/** Which dialog is open (one at a time). */
export type DialogName = "characters" | "dockets" | "changelog" | "filings" | "about" | "jump" | null;

export interface Dialogs {
  dialog: DialogName;
  /** Character whose docket the Dockets dialog shows. */
  docketsFor: string | null;
  /** J.A.P. "Turn on sync": the Characters dialog starts sync when it opens. */
  autoSync: boolean;
  /** Dockets "Use in form": a docket for the open FormView to load. */
  docketRequest: DocketRequest | null;
  changelogUnread: boolean;
  /** Open the Dockets dialog for a character; nothing for null. */
  openDockets(charId: string | null): void;
  openCharacters(startSync?: boolean): void;
  openChangelog(): void;
  /** Filing history (LP-15). */
  openFilings(): void;
  /** Help → About (LP-22). */
  openAbout(): void;
  /** The jump box (LP-128). */
  openJump(): void;
  closeDialog(): void;
  autoSyncDone(): void;
  /** Close the Dockets dialog and ask the open form to load this docket. */
  loadDocketInForm(docketId: string): void;
}

export function useDialogs(): Dialogs {
  const [dialog, setDialog] = useState<DialogName>(null);
  const [docketsFor, setDocketsFor] = useState<string | null>(null);
  const [changelogUnread, setChangelogUnread] = useState(() => isUnread());
  const [autoSync, setAutoSync] = useState(false);
  const [docketRequest, setDocketRequest] = useState<DocketRequest | null>(null);

  const openDockets = (charId: string | null) => {
    if (!charId) return;
    setDocketsFor(charId);
    setDialog("dockets");
  };

  const openCharacters = (startSync = false) => {
    setAutoSync(startSync);
    setDialog("characters");
  };

  const closeDialog = useCallback(() => setDialog(null), []);
  const openJump = useCallback(() => setDialog("jump"), []);
  const autoSyncDone = useCallback(() => setAutoSync(false), []);

  const loadDocketInForm = (docketId: string) => {
    setDialog(null);
    setDocketRequest((r) => ({ docketId, seq: (r ? r.seq : 0) + 1 }));
  };

  const openFilings = () => setDialog("filings");
  const openAbout = () => setDialog("about");

  const openChangelog = () => {
    markSeen();
    setChangelogUnread(false);
    setDialog("changelog");
  };

  return {
    dialog,
    docketsFor,
    autoSync,
    docketRequest,
    changelogUnread,
    openDockets,
    openCharacters,
    openChangelog,
    openFilings,
    openAbout,
    openJump,
    closeDialog,
    autoSyncDone,
    loadDocketInForm,
  };
}
