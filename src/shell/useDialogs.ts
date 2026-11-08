// The app shell's dialogs (LP-7, from App.tsx): which one is open (one at a
// time), the J.A.P. "Turn on sync" start, the request to load a case into a
// form, the What's new unread dot and the jump box (LP-128).

import { useCallback, useState } from "react";
import { isUnread, markSeen } from "@/lib/changelogSeen";
import type { DocketRequest } from "@/programs/filings";

/** Which dialog is open (one at a time). */
export type DialogName = "characters" | "changelog" | "filings" | "about" | "jump" | null;

export interface Dialogs {
  dialog: DialogName;
  /** J.A.P. "Turn on sync": the Characters dialog starts sync when it opens. */
  autoSync: boolean;
  /** A case for the open FormView to load. */
  docketRequest: DocketRequest | null;
  changelogUnread: boolean;
  openCharacters(startSync?: boolean): void;
  openChangelog(): void;
  /** What's new was read without the dialog (Settings, LP-109): clear the unread dot. */
  markChangelogSeen(): void;
  /** Filing history (LP-15). */
  openFilings(): void;
  /** Help → About (LP-22). */
  openAbout(): void;
  /** The jump box (LP-128). */
  openJump(): void;
  closeDialog(): void;
  autoSyncDone(): void;
  /** Close any dialog and ask the form to load this case. */
  loadDocketInForm(docketId: string, formId?: string, values?: Record<string, string>): void;
}

/** `changelogStamp`: What's new's stamp, for the unread dot. */
export function useDialogs(changelogStamp: string): Dialogs {
  const [dialog, setDialog] = useState<DialogName>(null);
  const [changelogUnread, setChangelogUnread] = useState(() => isUnread(changelogStamp));
  const [autoSync, setAutoSync] = useState(false);
  const [docketRequest, setDocketRequest] = useState<DocketRequest | null>(null);

  const openCharacters = (startSync = false) => {
    setAutoSync(startSync);
    setDialog("characters");
  };

  const closeDialog = useCallback(() => setDialog(null), []);
  const openJump = useCallback(() => setDialog("jump"), []);
  const autoSyncDone = useCallback(() => setAutoSync(false), []);

  /** Load a case into the open form, or into `formId` once it opens. */
  const loadDocketInForm = (docketId: string, formId?: string, values?: Record<string, string>) => {
    setDialog(null);
    setDocketRequest((r) => ({ docketId, formId, values, seq: (r ? r.seq : 0) + 1 }));
  };

  const openFilings = () => setDialog("filings");
  const openAbout = () => setDialog("about");

  const markChangelogSeen = useCallback(() => {
    markSeen(changelogStamp);
    setChangelogUnread(false);
  }, [changelogStamp]);

  const openChangelog = () => {
    markChangelogSeen();
    setDialog("changelog");
  };

  return {
    dialog,
    autoSync,
    docketRequest,
    changelogUnread,
    openCharacters,
    openChangelog,
    markChangelogSeen,
    openFilings,
    openAbout,
    openJump,
    closeDialog,
    autoSyncDone,
    loadDocketInForm,
  };
}
