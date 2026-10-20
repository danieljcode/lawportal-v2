// Draft history (LP-89): the earlier versions kept of this form's draft, with
// their times on the 1990 calendar and a preview; Restore replaces the current
// draft after asking (and Undo, or the snapshot kept first, brings it back).

import { useMemo, useState } from "react";
import { caseStore } from "@/lib/cases";
import { exhibitRefs, resolveExhibitRefs } from "@/lib/exhibits";
import { draftHistory, filledCount, snapshotTime, type Snapshot } from "@/lib/draftHistory";
import { render } from "@/lib/template";
import type { Tree } from "@/lib/types";
import Dialog from "./Dialog";

export interface DraftHistoryDialogProps {
  open: boolean;
  onClose(): void;
  formId: string;
  formTitle: string;
  /** The form's compiled template, for the preview. */
  tree: Tree;
  onRestore(snap: Snapshot): void;
}

export default function DraftHistoryDialog(p: DraftHistoryDialogProps) {
  return (
    <Dialog
      open={p.open}
      onClose={p.onClose}
      id="history-dialog"
      className="history"
      titleId="history-title"
      title={"Draft history: " + p.formTitle}
    >
      {/* Mounted only while open, so each opening reads the list afresh. */}
      <HistoryBody {...p} />
    </Dialog>
  );
}

function HistoryBody({ formId, tree, onRestore }: DraftHistoryDialogProps) {
  const [snapshots] = useState(() => draftHistory().list(formId));
  const [picked, setPicked] = useState(0);
  const snap = snapshots[picked] as Snapshot | undefined;
  // Engine output: every value is escaped (SafeHtml, LP-5).
  // Exhibit references read as the case's exhibits are now (LP-13).
  const preview = useMemo(() => {
    if (!snap) return null;
    const n = snap.state.values["Case number"];
    const c = typeof n === "string" && n.trim() ? caseStore().byNumber(n.trim()) : null;
    const exhibits = c ? exhibitRefs(c.exhibits) : [];
    return render(tree, resolveExhibitRefs(snap.state.values, exhibits), { exhibits });
  }, [tree, snap]);

  if (!snapshots.length) {
    return (
      <p id="history-empty">
        No earlier versions of this draft yet. One is kept every few minutes while you edit, and before Clear form.
      </p>
    );
  }

  const restore = () => {
    if (!snap) return;
    const question = "Replace your current draft with the version from " + snapshotTime(snap.at) + "?";
    if (confirm(question + " Undo brings it back.")) onRestore(snap);
  };

  return (
    <>
      <p className="small muted">
        The last {snapshots.length === 1 ? "version" : snapshots.length + " versions"} of this draft, newest first.
        Times are in-game.
      </p>
      <div className="history-layout">
        <ul className="history-list" id="history-list" role="listbox" aria-label="Versions">
          {snapshots.map((s, i) => (
            <li key={s.at} role="option" aria-selected={i === picked}>
              <button
                type="button"
                className={"history-item" + (i === picked ? " current" : "")}
                onClick={() => setPicked(i)}
              >
                <time dateTime={s.at}>{snapshotTime(s.at)}</time>
                <span className="small muted">
                  {filledCount(s.state.values) === 1
                    ? "1 field filled"
                    : filledCount(s.state.values) + " fields filled"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="history-preview">
          <div className="post-frame">
            <div className="preview post" id="history-preview" dangerouslySetInnerHTML={{ __html: preview || "" }} />
          </div>
          <div className="row">
            <button type="button" className="btn primary" id="history-restore" onClick={restore}>
              Restore this version
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
