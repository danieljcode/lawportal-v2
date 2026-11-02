// New client intake (LP-19): the client's details, the matter and a summary,
// then "Open case" makes the Case File case (lead, parties, court, status Open,
// the intake in its notes). The client sheet beside the form prints on its own as
// one page. Onboarding (LP-172): the conflict check runs here and stays with the
// names, the client is picked from or added to the Rolodex, and the next steps
// follow the case opening. An unfinished intake survives a refresh.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { caseProblem, caseStore } from "@/lib/cases";
import { contactStore } from "@/lib/contacts";
import { gameToday } from "@/lib/deadlines";
import {
  checkNames,
  checkState,
  cleanIntakeDraft,
  emptyIntake,
  INTAKE_DRAFT_KEY,
  intakeNotes,
  intakeProblem,
  intakeToCase,
  matterFor,
  MATTERS,
  MAX_DETAIL,
  MAX_SUMMARY,
  ROLODEX_NEW,
  ROLODEX_NONE,
  rolodexDefault,
  rolodexMatches,
  SOURCES,
  URGENCIES,
  type ClientSide,
  type Intake,
  type IntakeCheck,
} from "@/lib/intake";
import { runConflictCheck, type ConflictRun } from "@/lib/services/conflicts";
import { defaultKV, readJson, writeJson } from "@/lib/storage";
import type { Case, Character } from "@/lib/types";
import { useContactVersion } from "@/ui/useStore";
import { ConflictResult } from "./ConflictCheckView";

/** The letter the next steps offer, filled with what the intake captured. */
const LETTER_FORM = "extra-engagement-letter";

/** What just opened, for the next steps. */
interface Opened {
  case: Case;
  clientName: string;
  /** The client's Rolodex contact, when they have one. */
  contactId: string | null;
  letter: Record<string, string>;
  /** The case opened, but this went wrong after it. */
  warning: string;
}

export interface IntakeViewProps {
  characters: Character[];
  /** Defaults the lead to the character filing. */
  active: Character | null;
  /** Show a check from here on the Conflict check page, with its memo (LP-107). */
  onShowConflicts?(run: ConflictRun): void;
  /** Open a form with a case's details, and these fields, filled in. */
  onStartForm?(formId: string, caseId: string, values: Record<string, string>): void;
}

export default function IntakeView({ characters, active, onShowConflicts, onStartForm }: IntakeViewProps) {
  const lead = active ? active.id : "";
  // Each character's own: the Clients program starts afresh for another character.
  const draftKey = INTAKE_DRAFT_KEY + "_" + (lead || "firm");
  const [draft] = useState(() => cleanIntakeDraft(readJson(defaultKV(), draftKey), lead));
  const [intake, setIntake] = useState<Intake>(() => draft?.intake || emptyIntake(lead));
  const [check, setCheck] = useState<IntakeCheck | null>(draft?.check || null);
  const [rolodexPick, setRolodexPick] = useState<string | null>(draft?.rolodex ?? null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState("");
  const contactVersion = useContactVersion();
  const clients = useMemo(
    () =>
      contactVersion >= 0
        ? contactStore()
            .list()
            .filter((c) => c.type === "client")
        : [],
    [contactVersion],
  );
  const likely = rolodexMatches(intake.clientName, clients);
  const rolodex = rolodexPick ?? rolodexDefault(intake.clientName, clients);
  const state = checkState(intake, check);
  const today = gameToday();
  const leadName = characters.find((c) => c.id === intake.lead)?.name;

  // Kept as it's typed; only a real change to the form saves over the last draft.
  const empty = JSON.stringify(emptyIntake(lead));
  useEffect(() => {
    const kv = defaultKV();
    try {
      if (JSON.stringify(intake) === empty && !check) kv.remove(draftKey);
      else writeJson(kv, draftKey, { intake, check, rolodex: rolodexPick });
    } catch (err) {
      console.warn("[intake] couldn't keep the draft", err);
    }
  }, [draftKey, intake, check, rolodexPick, empty]);

  const set = <K extends keyof Intake>(key: K, value: Intake[K]) => {
    setIntake((i) => ({ ...i, [key]: value }));
    // A different client may be a different Rolodex contact.
    if (key === "clientName") setRolodexPick(null);
    setError("");
  };

  const pickMatter = (label: string) => setIntake((i) => ({ ...i, matter: label, side: matterFor(label).side }));
  const reset = () => {
    setIntake(emptyIntake(lead));
    setCheck(null);
    setRolodexPick(null);
    setError("");
  };
  const discard = () => {
    if (confirm("Discard this intake? What you've typed will be lost.")) reset();
  };

  const runCheck = () => {
    const run = runConflictCheck(checkNames(intake), active);
    setCheck({ names: run.names, matches: run.matches });
    setError("");
  };

  const openCase = (e: FormEvent) => {
    e.preventDefault();
    const problem =
      intakeProblem(intake) ||
      (state === "review" ? "Review the possible conflict and tick the box above before opening the case." : null) ||
      (rolodex ? null : "Choose who the client is in the Rolodex, or add them as a new client.");
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
      // The case exists now: whatever follows, a filled form must not make a second one (LP-149).
      let contactId: string | null = null;
      let warning = "";
      try {
        if (rolodex !== ROLODEX_NONE) {
          contactId =
            rolodex === ROLODEX_NEW
              ? contactStore().save({
                  name: intake.clientName.trim(),
                  type: "client",
                  ...(intake.phone.trim() ? { phone: intake.phone.trim() } : {}),
                  ...(intake.address.trim() ? { address: intake.address.trim() } : {}),
                }).id
              : rolodex;
          contactStore().link(contactId, saved.id, "client");
        }
      } catch (err) {
        contactId = null;
        warning = "The client wasn't linked: " + (err instanceof Error ? err.message : String(err));
      }
      setOpened({
        case: saved,
        clientName: intake.clientName.trim(),
        contactId,
        warning,
        letter: {
          "Client name": intake.clientName.trim(),
          "Client address": intake.address.trim(),
          Matter: intake.matter,
        },
      });
      reset();
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

  if (opened) {
    const client = opened.contactId ? clients.find((c) => c.id === opened.contactId) : undefined;
    return (
      <section id="intake" className="form-view intake" aria-labelledby="intake-opened-title">
        <div id="intake-opened" className="intake-opened" role="status">
          <h2 id="intake-opened-title">{"Case " + opened.case.caseNumber + " opened"}</h2>
          <p>{"For " + opened.clientName + ", in the Case File with this intake in its notes."}</p>
          {opened.warning && (
            <p className="error" id="intake-opened-warning">
              {opened.warning}
            </p>
          )}
        </div>
        <h3>Next steps</h3>
        <p className="small muted">These are optional, and nothing has been sent or signed.</p>
        <div className="row intake-next">
          <a className="btn primary" id="intake-open-case" href={"#cases/" + opened.case.id}>
            Open the case
          </a>
          <button
            type="button"
            className="btn"
            id="intake-letter"
            onClick={() => onStartForm?.(LETTER_FORM, opened.case.id, opened.letter)}
          >
            Prepare an engagement letter
          </button>
          {client && (
            <a className="btn" id="intake-retainer" href={"#ledger/retainers/" + client.id}>
              {"Open " + client.name + "'s retainer"}
            </a>
          )}
          <button type="button" className="btn" id="intake-another" onClick={() => setOpened(null)}>
            Take another intake
          </button>
        </div>
      </section>
    );
  }

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
          <button type="button" className="btn danger-quiet" id="intake-clear" onClick={discard}>
            Discard
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

          <fieldset className="case-people" id="intake-check">
            <legend>Conflict check</legend>
            {state === "unchecked" && (
              <p className="small" id="intake-check-state">
                Not checked yet.
              </p>
            )}
            {state === "stale" && (
              <p className="small bad" id="intake-check-state">
                Out of date: the names have changed since the last check. Run it again.
              </p>
            )}
            {check && state !== "unchecked" && state !== "stale" && (
              <>
                <ConflictResult
                  run={{ names: check.names, matches: check.matches }}
                  characters={characters}
                  runBy={active}
                  idPrefix="intake-conflict"
                />
                {check.matches.length > 0 && (
                  <label className="field check">
                    <input
                      type="checkbox"
                      id="intake-reviewed"
                      checked={!!check.reviewed}
                      onChange={(e) => {
                        setCheck({ ...check, reviewed: e.target.checked });
                        setError("");
                      }}
                    />
                    <span>I&apos;ve reviewed these matches and the firm can still take this client</span>
                  </label>
                )}
              </>
            )}
            <div className="row">
              <button
                type="button"
                className="btn"
                id="intake-conflicts"
                disabled={!intake.clientName.trim()}
                title="Check the client and the other side against the firm's cases"
                onClick={runCheck}
              >
                {check ? "Run it again" : "Run conflict check"}
              </button>
              {check && state !== "stale" && onShowConflicts && (
                <button
                  type="button"
                  className="btn"
                  id="intake-conflict-memo"
                  onClick={() => onShowConflicts({ names: check.names, matches: check.matches })}
                >
                  Memo and details
                </button>
              )}
            </div>
          </fieldset>

          <fieldset className="case-people" id="intake-rolodex-set">
            <legend>The Rolodex</legend>
            <div className="field">
              <label htmlFor="intake-rolodex">The client in the Rolodex</label>
              <select
                id="intake-rolodex"
                value={rolodex}
                onChange={(e) => {
                  setRolodexPick(e.target.value);
                  setError("");
                }}
              >
                {!rolodex && <option value="">Choose…</option>}
                <option value={ROLODEX_NEW}>Add as a new client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name + (c.organisation ? " · " + c.organisation : "")}
                  </option>
                ))}
                <option value={ROLODEX_NONE}>Don&apos;t add to the Rolodex</option>
              </select>
              {likely.length > 0 && (
                <p className="help" id="intake-rolodex-hint">
                  {(rolodex ? "Already in the Rolodex: " : "Might already be in the Rolodex: ") +
                    likely.map((c) => c.name).join(", ") +
                    "."}
                </p>
              )}
            </div>
          </fieldset>

          <p className="error" id="intake-error" role="alert">
            {error}
          </p>
          <div className="row">
            <button type="submit" className="btn primary" id="intake-open">
              Open case
            </button>
          </div>
          <p className="small muted">
            Open case adds the case to the Case File ({matterFor(intake.matter).court}, status Open) with this intake in
            its notes and links the client. This intake is kept on this device until then.
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
