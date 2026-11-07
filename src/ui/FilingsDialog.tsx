// Filing history (LP-15): every filing copied or downloaded, with a search, a
// filter by character and case number, a preview, and "Use as new draft".
// FilingList is also used by the Case File for a case's filings.

import { useMemo, useState } from "react";
import { getForm } from "@/data";
import { caseStore } from "@/lib/cases";
import { snapshotTime } from "@/lib/draftHistory";
import { exhibitRefs, resolveExhibitRefs } from "@/lib/exhibits";
import { letterheadStore } from "@/lib/letterhead";
import { filterFilings, filingStore, VIA_LABELS, type Filing } from "@/lib/filings";
import { compileForm, render } from "@/lib/template";
import type { Character } from "@/lib/types";
import Dialog from "./Dialog";
import { useFilingVersion } from "./useStore";

/**
 * A filing rendered with today's template (SafeHtml), or null when its form is gone. Compiled as
 * the form view compiles it (LP-136), so a blank Case number shows the pattern for the year filed.
 */
export function renderFiling(f: Filing) {
  const form = getForm(f.formId);
  if (!form) return null;
  try {
    const { tree } = compileForm(form, new Date(f.at));
    if (!tree) return null;
    // Exhibit references and the exhibit list follow the case as it is now (LP-13).
    const c = (f.caseId && caseStore().get(f.caseId)) || (f.caseNumber ? caseStore().byNumber(f.caseNumber) : null);
    const exhibits = c ? exhibitRefs(c.exhibits) : [];
    return render(tree, resolveExhibitRefs(f.state.values, exhibits), {
      exhibits,
      letterhead: letterheadStore().get(),
    });
  } catch {
    return null;
  }
}

export interface FilingListProps {
  filings: Filing[];
  /** The filing shown in a preview, if the list has one. */
  picked?: string | null;
  onPick?(id: string): void;
  onUse(f: Filing): void;
  /** Omit the case number on each row (the Case File lists one case's filings). */
  hideCase?: boolean;
}

/** Filings with their time, form, character and case, and the two actions. */
export function FilingList({ filings, picked, onPick, onUse, hideCase }: FilingListProps) {
  return (
    <ul className="filing-list">
      {filings.map((f) => (
        <li key={f.id} className={"filing" + (f.id === picked ? " current" : "")}>
          <button type="button" className="filing-main" onClick={() => onPick?.(f.id)} disabled={!onPick}>
            <strong>{f.formTitle}</strong>
            <span className="small muted">
              {[snapshotTime(f.at), f.charName, hideCase ? "" : f.caseNumber, VIA_LABELS[f.via]]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
          <span className="filing-actions">
            <button type="button" className="mini" onClick={() => onUse(f)}>
              Use as new draft
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface FilingsDialogProps {
  open: boolean;
  onClose(): void;
  characters: Character[];
  onUse(f: Filing): void;
}

export default function FilingsDialog(p: FilingsDialogProps) {
  return (
    <Dialog
      open={p.open}
      onClose={p.onClose}
      id="filings-dialog"
      className="filings"
      titleId="filings-title"
      title="Filing history"
    >
      <FilingsBody {...p} />
    </Dialog>
  );
}

function FilingsBody({ characters, onUse }: FilingsDialogProps) {
  const version = useFilingVersion();
  const all = useMemo(() => (version >= 0 ? filingStore().list() : []), [version]);
  const [q, setQ] = useState("");
  const [charId, setCharId] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const shown = useMemo(() => filterFilings(all, { q, charId, caseNumber }), [all, q, charId, caseNumber]);
  const current = shown.find((f) => f.id === picked) || shown[0] || null;
  const preview = useMemo(() => (current ? renderFiling(current) : null), [current]);
  const numbers = useMemo(
    () => [...new Set(all.map((f) => f.caseNumber).filter((n): n is string => !!n))].sort(),
    [all],
  );

  if (!all.length) {
    return (
      <p id="filings-empty">
        No filings yet. Each time you copy a filing for Discord, or download it as .docx or PDF, a copy is kept here.
      </p>
    );
  }

  return (
    <>
      <div className="case-filters" role="search">
        <input
          type="search"
          id="filings-search"
          placeholder="Form, case number or character…"
          aria-label="Search filings"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          id="filings-character"
          aria-label="Character"
          value={charId}
          onChange={(e) => setCharId(e.target.value)}
        >
          <option value="">Any character</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          id="filings-case"
          aria-label="Case number"
          value={caseNumber}
          onChange={(e) => setCaseNumber(e.target.value)}
        >
          <option value="">Any case</option>
          {numbers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted" id="filings-count">
        {shown.length === all.length
          ? all.length + (all.length === 1 ? " filing" : " filings")
          : shown.length + " of " + all.length + " filings"}
        {". Times are in-game."}
      </p>
      <div className="history-layout">
        <div>
          {shown.length ? (
            <FilingList filings={shown} picked={current?.id} onPick={setPicked} onUse={onUse} />
          ) : (
            <p className="muted">No filings match.</p>
          )}
        </div>
        <div className="history-preview">
          {current && (
            <div className="post-frame">
              <div
                className="preview post"
                id="filings-preview"
                // Engine output: every value is escaped (SafeHtml, LP-5).
                dangerouslySetInnerHTML={{ __html: preview || "" }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
