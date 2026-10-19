// A case's deadlines and hearing dates (LP-18): in-game dates with a label and
// a note, marked done, removed, or added. Each change saves the case straight
// away (the case details form above has its own Save).

import { useState, type FormEvent } from "react";
import { caseStore } from "@/lib/cases";
import { cleanDeadline, formatDay, gameToday, relativeDay, sortDeadlines } from "@/lib/deadlines";
import type { Case, Deadline } from "@/lib/types";

export default function CaseDeadlines({ c }: { c: Case }) {
  const today = gameToday();
  const [date, setDate] = useState(today);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const saveList = (deadlines: Deadline[]) => {
    try {
      caseStore().save({ ...c, deadlines });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const d = cleanDeadline({ date, label, note });
    if (!d) {
      setError(label.trim() ? "Pick a date." : "Give it a name, like Response due or Hearing.");
      return;
    }
    saveList(sortDeadlines([...c.deadlines, d]));
    setLabel("");
    setNote("");
  };

  return (
    <>
      {c.deadlines.length ? (
        <ul className="deadline-list" id="deadline-list">
          {c.deadlines.map((d) => {
            const overdue = !d.done && d.date < today;
            return (
              <li key={d.id} className={"deadline" + (d.done ? " done" : "") + (overdue ? " overdue" : "")}>
                <label className="field check">
                  <input
                    type="checkbox"
                    checked={!!d.done}
                    aria-label={"Done: " + d.label}
                    onChange={(e) =>
                      saveList(c.deadlines.map((x) => (x.id === d.id ? { ...x, done: e.target.checked } : x)))
                    }
                  />
                  <span>
                    <strong>{d.label}</strong>
                    <span className="small muted">
                      {formatDay(d.date) + " (" + relativeDay(d.date, today) + ")"}
                      {overdue ? " · overdue" : ""}
                    </span>
                    {d.note && <span className="small deadline-note">{d.note}</span>}
                  </span>
                </label>
                <button
                  type="button"
                  className="mini danger-quiet"
                  aria-label={"Remove " + d.label}
                  onClick={() => saveList(c.deadlines.filter((x) => x.id !== d.id))}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted">
          No deadlines yet. Add one below, or use Add dates to case in a form with this case number.
        </p>
      )}
      <form className="deadline-add" id="deadline-add" noValidate onSubmit={add} aria-label="Add a deadline">
        <input
          type="date"
          id="deadline-date"
          aria-label="Date (in-game)"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          type="text"
          id="deadline-label"
          placeholder="Response due, Hearing…"
          aria-label="What's due"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="text"
          id="deadline-note"
          placeholder="Note (optional)"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn" id="deadline-submit">
          Add
        </button>
      </form>
      <p className="error" role="alert" id="deadline-error">
        {error}
      </p>
    </>
  );
}
