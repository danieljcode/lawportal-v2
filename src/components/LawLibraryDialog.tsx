// The Law Library from inside a form (LP-16): search the firm's precedents and
// Insert citation into the form field last clicked in.

import Dialog from "./Dialog";
import { PrecedentSearch } from "./LawLibraryView";
import type { FieldTarget } from "./fields/FormContext";
import { citation, type Precedent } from "@/lib/precedents";

export interface LawLibraryDialogProps {
  open: boolean;
  onClose(): void;
  /** The field a citation goes into, or null before one is clicked in. */
  target: FieldTarget | null;
}

export default function LawLibraryDialog({ open, onClose, target }: LawLibraryDialogProps) {
  const insert = (p: Precedent) => {
    target?.insert(citation(p));
    onClose();
  };
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
      <PrecedentSearch
        idPrefix="library-dialog"
        onInsert={insert}
        insertOff={target ? undefined : "Click in a form field first"}
      />
      <p className="small muted">
        <a href="#library" onClick={onClose}>
          Open the Law Library
        </a>{" "}
        to add or edit rulings.
      </p>
    </Dialog>
  );
}
