// New client intake (LP-19): the client's details, the matter and a summary,
// then "Open case" makes the Case File case (lead, parties, court, status Open,
// the intake in its notes) and opens it. The client sheet beside the form
// prints on its own as one page.

import { useState, type FormEvent } from "react";
import { caseProblem, caseStore } from "@/lib/cases";
import { gameToday } from "@/lib/deadlines";
import {
  emptyIntake,
  intakeNotes,
  intakeProblem,
  intakeToCase,
  matterFor,
  MATTERS,
  MAX_DETAIL,
  MAX_SUMMARY,
  SOURCES,
  URGENCIES,
  type ClientSide,
  type Intake,
} from "@/lib/intake";
import type { Character } from "@/lib/types";

export interface IntakeViewProps {
  characters: Character[];
  /** Defaults the lead to the character filing. */
  active: Character | null;
  /** Run conflict check: check these names on the Conflict check page (LP-107). */
  onRunConflicts?(names: string[]): void;
}

export default function IntakeView({ characters, active, onRunConflicts }: IntakeViewProps) {
  const [intake, setIntake] = useState<Intake>(() => emptyIntake(active ? active.id : ""));
  const [error, setError] = useState("");
  const today = gameToday();
  const leadName = characters.find((c) => c.id === intake.lead)?.name;

  const set = <K extends keyof Intake>(key: K, value: Intake[K]) => {
    setIntake((i) => ({ ...i, [key]: value }));
    setError("");
  };

  const pickMatter = (label: string) => setIntake((i) => ({ ...i, matter: label, side: matterFor(label).side }));
  const clear = () => setIntake(emptyIntake(active ? active.id : ""));

  const openCase = (e: FormEvent) => {
    e.preventDefault();
    const problem = intakeProblem(intake);
    if (problem) {
      setError(problem);
      return;
    }
    const store = caseStore();
    const data = intakeToCase(intake, store.list(), today, leadName);
    const numberProblem = caseProblem({ id: "", caseNumber: data.caseNumber || "" }, store.list());
    if (numberProblem) {
      setError(numberProblem);
      return;
    }
    try {
      const saved = store.save(data);
      // The Clients program stays mounted (LP-126): a filled form would make a second PENDING-n case (LP-149).
      clear();
      location.hash = "#cases/" + saved.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const field = (key: keyof Intake, label: string, input: React.ReactNode) => (
    <div className="field">
      <label htmlFor={"intake-" + key}>{label}</label>
      {input}
    </div>
  );
  const text = (key: "clientName" | "phone" | "address" | "opposingParty" | "caseNumber", placeholder?: string) => (
    <input
      id={"intake-" + key}
      type="text"
      placeholder={placeholder}
      maxLength={MAX_DETAIL}
      value={intake[key]}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  return (
    <section id="intake" className="form-view intake">
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="intake-title">New client intake</h2>
        </div>
        <div className="form-head-actions">
          <button type="button" className="btn" id="intake-print" onClick={() => window.print()}>
            Print client sheet
          </button>
          <button type="button" className="btn danger-quiet" id="intake-clear" onClick={clear}>
            Clear
          </button>
        </div>
      </div>

      <div className="intake-layout">
        <form id="intake-form" className="case-form" noValidate onSubmit={openCase} aria-labelledby="intake-title">
          <fieldset className="case-people">
            <legend>The client</legend>
            <div className="case-fields">
              {field("clientName", "Client name *", text("clientName"))}
              {field("phone", "Phone", text("phone"))}
              <div className="field wide">
                <label htmlFor="intake-address">Address</label>
                {text("address")}
              </div>
              {field(
                "source",
                "How they found the firm",
                <select id="intake-source" value={intake.source} onChange={(e) => set("source", e.target.value)}>
                  <option value="">—</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                "urgency",
                "Urgency",
                <select id="intake-urgency" value={intake.urgency} onChange={(e) => set("urgency", e.target.value)}>
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>,
              )}
            </div>
          </fieldset>

          <fieldset className="case-people">
            <legend>The matter</legend>
            <div className="case-fields">
              {field(
                "matter",
                "Matter type",
                <select id="intake-matter" value={intake.matter} onChange={(e) => pickMatter(e.target.value)}>
                  {MATTERS.map((m) => (
                    <option key={m.label} value={m.label}>
                      {m.label}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                "side",
                "The client is the",
                <select
                  id="intake-side"
                  value={intake.side}
                  onChange={(e) => set("side", e.target.value as ClientSide)}
                >
                  <option value="plaintiff">Plaintiff / petitioner</option>
                  <option value="defendant">Defendant / respondent</option>
                </select>,
              )}
              {field("opposingParty", "Opposing party", text("opposingParty"))}
              {field(
                "caseNumber",
                "Case number (if there is one)",
                text("caseNumber", "Leave blank until the court gives one"),
              )}
              <div className="field wide">
                <label htmlFor="intake-summary">Summary of the issue *</label>
                <textarea
                  id="intake-summary"
                  rows={5}
                  maxLength={MAX_SUMMARY}
                  aria-describedby="intake-summary-help"
                  value={intake.summary}
                  onChange={(e) => set("summary", e.target.value)}
                />
                <p className="help" id="intake-summary-help">
                  Up to {MAX_SUMMARY.toLocaleString("en-GB")} characters, so it fits in the case notes under the
                  client&rsquo;s details.
                </p>
              </div>
              {field(
                "lead",
                "Lead on the case",
                <select id="intake-lead" value={intake.lead} onChange={(e) => set("lead", e.target.value)}>
                  <option value="">— no lead yet —</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>,
              )}
            </div>
          </fieldset>

          <p className="error" id="intake-error" role="alert">
            {error}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn"
              id="intake-conflicts"
              disabled={!intake.clientName.trim() || !onRunConflicts}
              title="Check the client and the other side on the Conflict check page"
              onClick={() => onRunConflicts?.([intake.clientName, intake.opposingParty].filter((n) => n.trim()))}
            >
              Run conflict check
            </button>
            <button type="submit" className="btn primary" id="intake-open">
              Open case
            </button>
          </div>
          <p className="small muted">
            Open case adds the case to the Case File ({matterFor(intake.matter).court}, status Open) with this intake in
            its notes, then opens it.
          </p>
        </form>

        <article className="intake-sheet" id="intake-sheet" aria-label="Client sheet">
          <h3>Client sheet</h3>
          <pre>{intakeNotes(intake, today, leadName)}</pre>
        </article>
      </div>
    </section>
  );
}
