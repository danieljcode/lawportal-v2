// Quick add (LP-221): a note, a time entry or a next action on a case in a couple of taps, from home
// or an open case, without opening the full program. It saves through the same stores as the Case File
// and the Ledger, so it syncs as usual. Its code loads the first time it opens.

import { useMemo, useState, type FormEvent } from "react";
import { cleanAction } from "@/lib/actions";
import { newCaseNote } from "@/lib/caseNotes";
import { caseStore } from "@/lib/cases";
import { gameToday } from "@/lib/deadlines";
import { ACTIVITIES, ACTIVITY_LABELS, timeStore, type Activity } from "@/lib/ledger";
import type { Case, Character } from "@/lib/types";
import Dialog from "./Dialog";
import { useCaseVersion } from "./useStore";

export type QuickKind = "note" | "time" | "action";
const KINDS: Array<[QuickKind, string]> = [
  ["note", "Note"],
  ["time", "Time"],
  ["action", "Next action"],
];

/** The case to start on: the one open, else the most recently changed. */
export function startCase(cases: readonly Case[], openId: string | null | undefined): string {
  if (openId && cases.some((c) => c.id === openId)) return openId;
  return [...cases].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0))[0]?.id || "";
}

export interface QuickAddProps {
  open: boolean;
  onClose(): void;
  /** The case open now, if any. */
  caseId: string | null;
  active: Character | null;
}

function QuickAddBody({ caseId, active }: QuickAddProps) {
  const version = useCaseVersion();
  const cases = useMemo(
    () => (version >= 0 ? [...caseStore().list()].sort((a, b) => a.caseNumber.localeCompare(b.caseNumber)) : []),
    [version],
  );
  const [kind, setKind] = useState<QuickKind>("note");
  const [target, setTarget] = useState(() => startCase(caseStore().list(), caseId));
  const [body, setBody] = useState("");
  const [hours, setHours] = useState("");
  const [activity, setActivity] = useState<Activity>("research");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!cases.length) {
    return (
      <p className="small muted" id="quick-none">
        No cases yet. Make one in the Case File first.
      </p>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = caseStore().get(target);
    if (!c) return setError("Pick a case.");
    try {
      if (kind === "note") {
        if (!body.trim()) return setError("Write the note first.");
        caseStore().save({ ...c, caseNotes: [...(c.caseNotes || []), newCaseNote(body, active?.id)] });
      } else if (kind === "action") {
        const a = cleanAction({ title: body, owner: active?.id });
        if (!a) return setError("Say what needs doing, like Call the client.");
        caseStore().save({ ...c, actions: [...(c.actions || []), a] });
      } else {
        if (!active) return setError("Pick who you're playing first, so the time is theirs.");
        timeStore().save({
          caseId: c.id,
          character: active.id,
          date: gameToday(),
          hours: Number(hours),
          activity,
          note: body,
        });
      }
    } catch (err) {
      return setError(err instanceof Error ? err.message : String(err));
    }
    setError("");
    setBody("");
    setHours("");
    setDone((kind === "time" ? "Time" : kind === "note" ? "Note" : "Next action") + " added to " + c.caseNumber + ".");
  };

  return (
    <form className="quick-add" id="quick-form" noValidate onSubmit={submit}>
      <div className="quick-kinds" role="radiogroup" aria-label="What to add">
        {KINDS.map(([k, label]) => (
          <label key={k} className={"btn quick-kind" + (kind === k ? " primary" : "")}>
            <input
              type="radio"
              name="quick-kind"
              value={k}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                setError("");
                setDone("");
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="small">Case</span>
        <select id="quick-case" value={target} onChange={(e) => setTarget(e.target.value)}>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber + (c.defendant || c.plaintiff ? " · " + (c.defendant || c.plaintiff) : "")}
            </option>
          ))}
        </select>
      </label>
      {kind === "time" && (
        <div className="quick-row">
          <label className="field">
            <span className="small">Hours</span>
            <input
              type="number"
              id="quick-hours"
              inputMode="decimal"
              min={0.1}
              max={24}
              step={0.1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="small">Doing</span>
            <select id="quick-activity" value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="field">
        <span className="small">
          {kind === "note" ? "Note" : kind === "action" ? "What needs doing" : "Note (optional)"}
        </span>
        {kind === "note" ? (
          <textarea id="quick-text" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        ) : (
          <input
            type="text"
            id="quick-text"
            maxLength={kind === "action" ? 120 : 500}
            placeholder={kind === "action" ? "Call the client, Request disclosure…" : ""}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
      </label>
      <p className="error" role="alert" id="quick-error">
        {error}
      </p>
      <p className="small good" role="status" id="quick-done">
        {done}
      </p>
      <button type="submit" className="btn primary quick-save" id="quick-save">
        Add
      </button>
    </form>
  );
}

export default function QuickAddDialog(p: QuickAddProps) {
  return (
    <Dialog
      open={p.open}
      onClose={p.onClose}
      id="quick-dialog"
      className="quick"
      titleId="quick-title"
      title="Quick add"
    >
      <QuickAddBody {...p} />
    </Dialog>
  );
}
