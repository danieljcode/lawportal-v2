// The Court Docket (LP-91): for a judge, the cases before them with their standing
// and next date, soonest first. A judge template opens from a case with its
// details filled in. Dates are in-game. CaseFileProgram shows it only to judges.

import { useMemo, useState } from "react";
import { FORM_INDEX } from "@/data/form-index";
import { caseStore } from "@/lib/cases";
import { courtDocket, DOCKET_STANDINGS, type DocketStanding } from "@/lib/courtDocket";
import { formatDay, gameToday, relativeDay } from "@/lib/deadlines";
import type { Character } from "@/lib/types";
import { useCaseVersion } from "@/ui/useStore";

/** What a judge issues: the Judge templates (LP-90) and the Order Decree. */
const JUDGE_FORMS = FORM_INDEX.filter((f) => f.section === "Judge" || f.id === "misc-order-decree");

export interface CourtDocketViewProps {
  judge: Character;
  /** Open a form with a case's details filled in. */
  onStartForm(formId: string, caseId: string): void;
}

export default function CourtDocketView({ judge, onStartForm }: CourtDocketViewProps) {
  const version = useCaseVersion();
  const today = gameToday();
  const [standing, setStanding] = useState<DocketStanding | "">("");
  const rows = useMemo(
    () => (version >= 0 ? courtDocket(caseStore().list(), judge.id, today, standing || undefined) : []),
    [version, judge.id, today, standing],
  );

  return (
    <section id="court-docket" className="form-view upcoming">
      <div className="form-head">
        <div>
          <p className="crumb muted">{judge.name}</p>
          <h2 id="court-docket-title">Court Docket</h2>
        </div>
        <div className="form-head-actions">
          <select
            id="court-docket-filter"
            aria-label="Show"
            value={standing}
            onChange={(e) => setStanding(e.target.value as DocketStanding | "")}
          >
            <option value="">All cases</option>
            {DOCKET_STANDINGS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="small muted">{"Today is " + formatDay(today) + ". Soonest next date first."}</p>
      {rows.length ? (
        <ul className="upcoming-list" id="court-docket-list">
          {rows.map(({ case: c, standing: s, next, awaitingRuling }) => (
            <li key={c.id} className={"upcoming-item" + (awaitingRuling ? " soon" : "")}>
              <span className="upcoming-when">
                <strong>{next ? formatDay(next.date) : "No date set"}</strong>
                {next && <span className="small">{next.label + ", " + relativeDay(next.date, today)}</span>}
              </span>
              <span className="upcoming-what">
                <a href={"#cases/" + c.id}>
                  <strong>{c.caseNumber}</strong>
                </a>
                {(c.plaintiff || c.defendant) && <span>{[c.plaintiff, c.defendant].filter(Boolean).join(" v. ")}</span>}
                <span className="small muted">{awaitingRuling ? s + ": awaiting your ruling" : s}</span>
              </span>
              <StartTemplate caseNumber={c.caseNumber} onStart={(formId) => onStartForm(formId, c.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p id="court-docket-empty">
          {standing
            ? "No cases are " + standing.toLowerCase() + "."
            : "No cases before you yet. Cases you lead or are assigned to show here."}
        </p>
      )}
    </section>
  );
}

function StartTemplate({ caseNumber, onStart }: { caseNumber: string; onStart(formId: string): void }) {
  const [formId, setFormId] = useState(JUDGE_FORMS[0]?.id || "");
  return (
    <span className="docket-start">
      <select aria-label={"Template for " + caseNumber} value={formId} onChange={(e) => setFormId(e.target.value)}>
        {JUDGE_FORMS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title}
          </option>
        ))}
      </select>
      <button type="button" className="mini" aria-label={"Start for " + caseNumber} onClick={() => onStart(formId)}>
        Start
      </button>
    </span>
  );
}
