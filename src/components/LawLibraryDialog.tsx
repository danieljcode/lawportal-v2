// The Law Library from inside a form: search the penal code (LP-17) or the
// firm's precedents (LP-16) and Insert citation into the form field last
// clicked in.

import { useState } from "react";
import Dialog from "./Dialog";
import { LibraryTabs, PrecedentSearch, type LibraryTab } from "./LawLibraryView";
import PenalCodeSearch from "./PenalCodeSearch";
import type { FieldTarget } from "./fields/FormContext";
import { chargeCitation } from "@/lib/penalCode";
import { citation, type Precedent } from "@/lib/precedents";

export interface LawLibraryDialogProps {
  open: boolean;
  onClose(): void;
  /** The field a citation goes into, or null before one is clicked in. */
  target: FieldTarget | null;
}

export default function LawLibraryDialog({ open, onClose, target }: LawLibraryDialogProps) {
  const [tab, setTab] = useState<LibraryTab>("code");
  const insert = (text: string) => {
    target?.insert(text);
    onClose();
  };
  const insertOff = target ? undefined : "Click in a form field first";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      id="library-dialog"
      className="library"
      titleId="library-dialog-title"
      title="Law Library"
    >
      <p className="small" id="library-target">
        {target ? (
          <>
            Insert citation goes into <strong>{target.label}</strong>, where your cursor was.
          </>
        ) : (
          "Click in a form field first, then open the Law Library to insert a citation there."
        )}
      </p>
      <LibraryTabs tab={tab} onTab={setTab} idPrefix="library-dialog" />
      {tab === "code" ? (
        <PenalCodeSearch
          idPrefix="library-dialog-code"
          onInsert={(c) => insert(chargeCitation(c))}
          insertOff={insertOff}
        />
      ) : (
        <PrecedentSearch
          idPrefix="library-dialog"
          onInsert={(p: Precedent) => insert(citation(p))}
          insertOff={insertOff}
        />
      )}
      <p className="small muted">
        <a href="#library/penal-code" onClick={onClose}>
          Open the Law Library
        </a>{" "}
        to add or edit the firm&apos;s rulings.
      </p>
    </Dialog>
  );
}
