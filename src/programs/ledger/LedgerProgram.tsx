// The Ledger program (LP-32): billable time logged against Case File cases, with
// a form to log or edit an entry, filters by case, character and date range,
// and the filtered total. Each entry is worth its hours at the case's rate, else
// the character's own. A timer logs an entry when it stops. #ledger/case/<id> opens
// it scoped to one case, from that case's billing summary (LP-173).

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { caseStore } from "@/lib/cases";
import { formatDay, gameToday } from "@/lib/deadlines";
import { billedEntries, invoiceStore } from "@/lib/invoices";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  entryValue,
  filterEntries,
  formatMoney,
  hoursText,
  parseRate,
  rateLookup,
  timerMinutes,
  timerStore,
  timeStore,
  totalHours,
  type Activity,
  type TimeEntry,
  type TimeFilter,
} from "@/lib/ledger";
import type { Case } from "@/lib/types";
import ErrorBoundary from "@/ui/ErrorBoundary";
import GameDateInput from "@/ui/GameDateInput";
import { useCaseVersion, useInvoiceVersion, useTimerVersion, useTimeVersion } from "@/ui/useStore";
import type { ProgramProps } from "@/shell/program";
import Invoices from "./Invoices";
import Reports from "./Reports";
import Retainers from "./Retainers";

/** "90SCCR00147 Smith v. Jones". */
/** Time rows drawn at first, newest first (LP-222): a full year is thousands, and drawing them all froze a phone. */
const ROWS = 100;

const caseLabel = (c: Case) => [c.caseNumber, [c.plaintiff, c.defendant].filter(Boolean).join(" v. ")].join(" ").trim();

interface Draft {
  caseId: string;
  character: string;
  date: string;
  hours: string;
  activity: Activity;
  note: string;
}

/** Log or edit one entry. */
function EntryForm({
  editing,
  cases,
  characters,
  start,
  onDone,
}: {
  editing: TimeEntry | null;
  cases: readonly Case[];
  characters: ProgramProps["shell"]["characters"];
  /** A new entry's case and character. */
  start: Pick<Draft, "caseId" | "character">;
  onDone(): void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? { ...editing, hours: String(editing.hours), note: editing.note || "" }
      : { ...start, date: gameToday(), hours: "", activity: "research", note: "" },
  );
  const [error, setError] = useState("");
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    try {
      timeStore().save({ ...(editing ? { id: editing.id } : {}), ...draft, hours: Number(draft.hours) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="case-form ledger-form" id="time-form" noValidate onSubmit={submit}>
      <h4>{editing ? "Edit time" : "Log time"}</h4>
      <div className="case-fields">
        <div className="field">
          <label htmlFor="time-case">Case</label>
          <select id="time-case" value={draft.caseId} onChange={set("caseId")}>
            <option value="">Pick a case…</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {caseLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="time-character">Character</label>
          <select id="time-character" value={draft.character} onChange={set("character")}>
            <option value="">Pick a character…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="time-date">Date</label>
          <GameDateInput id="time-date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
        </div>
        <div className="field">
          <label htmlFor="time-hours">Hours</label>
          <input
            id="time-hours"
            inputMode="decimal"
            placeholder="e.g. 1.5"
            value={draft.hours}
            onChange={set("hours")}
          />
        </div>
        <div className="field">
          <label htmlFor="time-activity">Activity</label>
          <select id="time-activity" value={draft.activity} onChange={set("activity")}>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field wide">
        <label htmlFor="time-note">Note</label>
        <input id="time-note" value={draft.note} onChange={set("note")} />
      </div>
      <p className="error" role="alert" id="time-error">
        {error}
      </p>
      <div className="row">
        <button type="submit" className="btn primary" id="time-save">
          {editing ? "Save time" : "Log time"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** "1 h 05 min" for 65 minutes. */
const elapsedText = (min: number) =>
  (min >= 60 ? Math.floor(min / 60) + " h " + String(min % 60).padStart(2, "0") : min) + " min";

/** Start timing a case, or the running timer with Stop and log. */
function TimerPanel({
  cases,
  characters,
  start,
  nameOf,
}: {
  cases: readonly Case[];
  characters: ProgramProps["shell"]["characters"];
  start: { caseId: string; character: string };
  nameOf(id: string): string;
}) {
  const version = useTimerVersion();
  const running = useMemo(() => (version >= 0 ? timerStore().get() : null), [version]);
  const [pick, setPick] = useState(start);
  const [error, setError] = useState("");
  // Tick the elapsed time while it runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [running]);

  if (running) {
    const c = cases.find((x) => x.id === running.caseId);
    return (
      <div className="row ledger-timer" id="timer">
        <span id="timer-status">
          {"Timing " + (c ? c.caseNumber : "a deleted case") + " for " + nameOf(running.character) + ": "}
          <strong>{elapsedText(timerMinutes(running, now))}</strong>
        </span>
        <button
          type="button"
          className="btn primary"
          id="timer-stop"
          onClick={() => {
            try {
              timerStore().stop(gameToday());
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Stop and log
        </button>
        <button
          type="button"
          className="btn"
          id="timer-discard"
          onClick={() => confirm("Discard this timer without logging its time?") && timerStore().discard()}
        >
          Discard
        </button>
        <span className="error" role="alert">
          {error}
        </span>
      </div>
    );
  }
  const begin = () => {
    if (!pick.caseId || !pick.character) {
      setError("Pick a case and a character to time.");
      return;
    }
    setError("");
    timerStore().start({ ...pick, activity: "research" });
  };
  return (
    <div className="row ledger-timer" id="timer">
      <select
        id="timer-case"
        aria-label="Case to time"
        value={pick.caseId}
        onChange={(e) => setPick({ ...pick, caseId: e.target.value })}
      >
        <option value="">Case to time…</option>
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            {caseLabel(c)}
          </option>
        ))}
      </select>
      <select
        id="timer-character"
        aria-label="Character to time"
        value={pick.character}
        onChange={(e) => setPick({ ...pick, character: e.target.value })}
      >
        <option value="">Character…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="button" className="btn" id="timer-start" onClick={begin}>
        Start timer
      </button>
      <span className="error" role="alert" id="timer-error">
        {error}
      </span>
    </div>
  );
}

/** The case's own hourly rate, over each character's; blank to use theirs. */
function CaseRate({ c }: { c: Case }) {
  const [value, setValue] = useState(c.rate ? String(c.rate) : "");
  const [error, setError] = useState("");
  const save = (ev: FormEvent) => {
    ev.preventDefault();
    const rate = parseRate(value);
    if (value.trim() && rate === null) {
      setError("Give a rate in dollars, e.g. 150.");
      return;
    }
    setError("");
    caseStore().save({ ...c, rate: rate ?? undefined });
  };
  return (
    <form className="row ledger-rate" id="case-rate-form" noValidate onSubmit={save}>
      <label htmlFor="case-rate">Hourly rate on {c.caseNumber} ($)</label>
      <input
        id="case-rate"
        inputMode="decimal"
        placeholder="Each character's own"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="btn" id="case-rate-save">
        Set rate
      </button>
      <span className="error" role="alert" id="case-rate-error">
        {error}
      </span>
    </form>
  );
}

function LedgerView({ shell }: ProgramProps) {
  const version = useTimeVersion();
  const all = useMemo(() => (version >= 0 ? timeStore().list() : []), [version]);
  const invoiceVersion = useInvoiceVersion();
  // An invoice keeps its own copy of the time, so billed time is locked to keep the two the same (LP-183).
  const billedOn = useMemo(
    () => (invoiceVersion >= 0 ? billedEntries(invoiceStore().list()) : new Map<string, string>()),
    [invoiceVersion],
  );
  const caseVersion = useCaseVersion();
  const cases = useMemo(
    () => [...(caseVersion >= 0 ? caseStore().list() : [])].sort((a, b) => a.caseNumber.localeCompare(b.caseNumber)),
    [caseVersion],
  );
  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const nameOf = (id: string) => shell.characters.find((c) => c.id === id)?.name || "Deleted character";
  const rateOf = rateLookup(cases, shell.characters);
  const valueOf = (e: TimeEntry) => entryValue(e, rateOf(e));
  const { route } = shell;
  /** Where the route asks to arrive (LP-173): the Ledger scoped to a case that's still here. */
  const arrival = route.program === "ledger" && route.caseId && caseById.has(route.caseId) ? route : null;
  const canLog = shell.characters.length > 0;
  const [filter, setFilter] = useState<TimeFilter>(arrival ? { caseId: arrival.caseId } : {});
  const shown = useMemo(() => filterEntries(all, filter), [all, filter]);
  const [rows, setRows] = useState(ROWS);
  const values = shown.map(valueOf);
  const unpriced = values.filter((v) => v === null).length;
  const filteredCase = filter.caseId ? caseById.get(filter.caseId) : undefined;
  /** The entry being edited, "new" for the log form, or null. */
  const [formFor, setEditing] = useState<TimeEntry | "new" | null>(arrival?.at === "log" && canLog ? "new" : null);
  // The form shuts if the time it's editing goes on an invoice meanwhile.
  const editing = formFor && formFor !== "new" && billedOn.has(formFor.id) ? null : formFor;
  // Each navigation here is a new route object, so a second Log time from the same case still opens the form.
  const [seenRoute, setSeenRoute] = useState(route);
  if (route !== seenRoute) {
    setSeenRoute(route);
    if (arrival) {
      setFilter({ caseId: arrival.caseId });
      if (arrival.at === "log" && canLog) setEditing("new");
    }
  }
  const arriveAt = arrival?.at;
  useEffect(() => {
    if (arriveAt) document.getElementById(arriveAt === "log" ? "time-form" : "invoices")?.scrollIntoView?.();
  }, [arriveAt, route]);
  const setF = (k: keyof TimeFilter) => (v: string) => setFilter({ ...filter, [k]: v || undefined });

  const remove = (e: TimeEntry) => {
    if (confirm("Delete " + hoursText(e.hours) + " on " + formatDay(e.date) + "?")) timeStore().remove(e.id);
  };

  return (
    <section id="ledger" className="form-view ledger">
      <div className="form-head">
        <div>
          <h2 id="ledger-title">Ledger</h2>
        </div>
      </div>
      {filteredCase && (
        <p className="small">
          <a id="ledger-back-case" href={"#cases/" + filteredCase.id}>
            {"← Back to " + filteredCase.caseNumber}
          </a>
        </p>
      )}
      <div className="row ledger-head">
        <p className="small muted">Billable time, logged against the firm&apos;s cases.</p>
        {!editing && cases.length > 0 && shell.characters.length > 0 && (
          <button type="button" className="btn" id="time-new" onClick={() => setEditing("new")}>
            Log time
          </button>
        )}
      </div>
      {!cases.length && (
        <p className="small" id="ledger-no-cases">
          Time is logged against a case. Open one in the <a href="#cases">Case File</a> first.
        </p>
      )}
      {!shell.characters.length && (
        <p className="small" id="ledger-no-characters">
          Time is logged by one of your characters. Add one in the Characters dialog first.
        </p>
      )}
      {cases.length > 0 && shell.characters.length > 0 && (
        <TimerPanel
          cases={cases}
          characters={shell.characters}
          start={{ caseId: filter.caseId || "", character: filter.character || shell.active?.id || "" }}
          nameOf={nameOf}
        />
      )}
      {editing && (
        <EntryForm
          key={editing === "new" ? "new" + (arrival?.caseId || "") : editing.id}
          editing={editing === "new" ? null : editing}
          cases={cases}
          characters={shell.characters}
          start={{ caseId: filter.caseId || "", character: filter.character || shell.active?.id || "" }}
          onDone={() => setEditing(null)}
        />
      )}
      {all.length > 0 && (
        <>
          <div className="row ledger-filters">
            <select
              id="ledger-case"
              aria-label="Case"
              value={filter.caseId || ""}
              onChange={(e) => setF("caseId")(e.target.value)}
            >
              <option value="">All cases</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {caseLabel(c)}
                </option>
              ))}
            </select>
            <select
              id="ledger-character"
              aria-label="Character"
              value={filter.character || ""}
              onChange={(e) => setF("character")(e.target.value)}
            >
              <option value="">All characters</option>
              {shell.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <GameDateInput id="ledger-from" aria-label="From" value={filter.from || ""} onChange={setF("from")} />
            <GameDateInput id="ledger-to" aria-label="To" value={filter.to || ""} onChange={setF("to")} />
          </div>
          <p className="small" id="ledger-total">
            <strong>{hoursText(totalHours(shown))}</strong>
            {shown.length === all.length
              ? " in " + all.length + (all.length === 1 ? " entry" : " entries")
              : " in " + shown.length + " of " + all.length + " entries"}
            {", worth "}
            <strong>{formatMoney(values.reduce<number>((n, v) => n + (v ?? 0), 0))}</strong>
            {unpriced > 0 && " (" + unpriced + " with no rate)"}
          </p>
          {filteredCase && <CaseRate key={filteredCase.id + (filteredCase.rate ?? "")} c={filteredCase} />}
          {shown.some((e) => billedOn.has(e.id)) && (
            <p className="small" id="ledger-billed-note">
              Time on an invoice is locked. To change it, delete that invoice below, then bill the time again.
            </p>
          )}
          {shown.length > 0 && (
            <div className="ledger-scroll">
              <table className="ledger-table" id="ledger-list">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Case</th>
                    <th scope="col">Character</th>
                    <th scope="col">Activity</th>
                    <th scope="col" className="num">
                      Hours
                    </th>
                    <th scope="col" className="num">
                      Value
                    </th>
                    <th scope="col">Note</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, rows).map((e, i) => {
                    const c = caseById.get(e.caseId);
                    return (
                      <tr key={e.id}>
                        <td>{formatDay(e.date)}</td>
                        <td>{c ? <a href={"#cases/" + c.id}>{c.caseNumber}</a> : "Deleted case"}</td>
                        <td>{nameOf(e.character)}</td>
                        <td>{ACTIVITY_LABELS[e.activity]}</td>
                        <td className="num">{e.hours.toFixed(1)}</td>
                        <td className="num">{values[i] === null ? "—" : formatMoney(values[i]!)}</td>
                        <td>{e.note}</td>
                        <td className="ledger-actions">
                          {billedOn.has(e.id) ? (
                            "On " + billedOn.get(e.id)
                          ) : (
                            <>
                              <button type="button" className="mini" onClick={() => setEditing(e)}>
                                Edit
                              </button>
                              <button type="button" className="mini danger-quiet" onClick={() => remove(e)}>
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {shown.length > rows && (
            <button type="button" className="btn" id="ledger-more" onClick={() => setRows(rows + ROWS)}>
              {"Show more (" + (shown.length - rows) + " left)"}
            </button>
          )}
        </>
      )}
      <Invoices cases={cases} entries={all} filter={filter} rateOf={rateOf} nameOf={nameOf} />
      <Retainers openFor={shell.route.program === "ledger" ? shell.route.retainerFor : undefined} />
      <Reports entries={all} cases={cases} characters={shell.characters} nameOf={nameOf} rateOf={rateOf} />
    </section>
  );
}

export default function LedgerProgram(props: ProgramProps) {
  return (
    <div className="layout no-nav">
      <main className="editor" id={props.shell.visible ? "editor" : undefined}>
        <ErrorBoundary where="the Ledger" resetKey="ledger">
          <LedgerView {...props} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
