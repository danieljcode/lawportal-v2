// A case's next actions (LP-170): everyday work with an owner and an optional
// in-game due date. Open ones first, soonest due; done ones in their own list,
// where they can be reopened. Each change saves the case straight away, as
// deadlines do.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { cleanAction, doneActions, isOverdue, openActions } from "@/lib/actions";
import { caseStore } from "@/lib/cases";
import { formatDay, gameToday, relativeDay } from "@/lib/deadlines";
import type { Case, CaseAction, Character } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";

export default function CaseActions({ c, characters }: { c: Case; characters: Character[] }) {
  const today = gameToday();
  const list = c.actions || [];
  const [editing, setEditing] = useState<string | null>(null);
  // Bumped after each add, so the add form starts empty again.
  const [added, setAdded] = useState(0);
  const [error, setError] = useState("");

  // Owners this browser doesn't have (from another device) still show.
  const known = new Set(characters.map((x) => x.id));
  const people = [
    ...characters.map((x) => ({ id: x.id, name: x.name })),
    ...[...new Set(list.map((a) => a.owner).filter((id): id is string => !!id && !known.has(id)))].map((id) => ({
      id,
      name: "Unknown character",
    })),
  ];
  const nameOf = (id?: string) => (id ? people.find((p) => p.id === id)?.name || "Unknown character" : "Unassigned");

  const saveList = (actions: CaseAction[]) => {
    try {
      caseStore().save({ ...c, actions });
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const replace = (a: CaseAction) => saveList(list.map((x) => (x.id === a.id ? a : x)));

  const row = (a: CaseAction) => {
    if (editing === a.id) {
      return (
        <li key={a.id} className="deadline">
          <ActionForm
            initial={a}
            people={people}
            onSave={(next) => replace(next) && setEditing(null)}
            onCancel={() => setEditing(null)}
            onError={setError}
          />
        </li>
      );
    }
    const overdue = isOverdue(a, today);
    return (
      <li key={a.id} className={"deadline" + (a.done ? " done" : "") + (overdue ? " overdue" : "")}>
        <label className="field check">
          <input
            type="checkbox"
            checked={!!a.done}
            aria-label={(a.done ? "Reopen: " : "Done: ") + a.title}
            onChange={(e) => replace({ ...a, done: e.target.checked })}
          />
          <span>
            <strong>{a.title}</strong>
            <span className="small muted">
              {nameOf(a.owner)}
              {a.due ? " · due " + formatDay(a.due) + " (" + relativeDay(a.due, today) + ")" : ""}
              {overdue ? " · overdue" : ""}
            </span>
          </span>
        </label>
        <span className="action-buttons">
          <button type="button" className="mini" aria-label={"Edit " + a.title} onClick={() => setEditing(a.id)}>
            Edit
          </button>
          <button
            type="button"
            className="mini danger-quiet"
            aria-label={"Remove " + a.title}
            onClick={() => saveList(list.filter((x) => x.id !== a.id))}
          >
            Remove
          </button>
        </span>
      </li>
    );
  };

  const open = openActions(list);
  const done = doneActions(list);
  return (
    <>
      {open.length ? (
        <ul className="deadline-list" id="action-list">
          {open.map(row)}
        </ul>
      ) : (
        <p className="small muted">
          {done.length
            ? "Nothing left to do."
            : "No actions yet. Add the next piece of work below, like Call the client."}
        </p>
      )}
      <ActionForm
        key={added}
        people={people}
        onSave={(a) => saveList([...list, a]) && setAdded((n) => n + 1)}
        onError={setError}
      />
      <p className="error" role="alert" id="action-error">
        {error}
      </p>
      {done.length > 0 && (
        <details className="action-done" id="action-done">
          <summary>Done ({done.length})</summary>
          <ul className="deadline-list">{done.map(row)}</ul>
        </details>
      )}
    </>
  );
}

interface ActionFormProps {
  /** The action being edited, or absent to add one. */
  initial?: CaseAction;
  people: Array<{ id: string; name: string }>;
  /** Save the cleaned action; the add form remounts (cleared) once it's saved. */
  onSave(a: CaseAction): void;
  onCancel?(): void;
  onError(message: string): void;
}

function ActionForm({ initial, people, onSave, onCancel, onError }: ActionFormProps) {
  const [title, setTitle] = useState(initial?.title || "");
  const [owner, setOwner] = useState(initial?.owner || "");
  const [due, setDue] = useState(initial?.due || "");
  const prefix = initial ? "action-edit" : "action";
  const titleRef = useRef<HTMLInputElement>(null);

  // Edit puts you in the title, so the keyboard lands where the change is.
  const editing = !!initial;
  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const a = cleanAction({ ...initial, title, owner: owner || undefined, due: due || undefined });
    if (!a) {
      onError("Say what needs doing, like Request disclosure.");
      return;
    }
    onSave(a);
  };

  return (
    <form
      className="deadline-add"
      id={prefix + "-form"}
      noValidate
      onSubmit={submit}
      aria-label={initial ? "Edit " + initial.title : "Add an action"}
    >
      <input
        type="text"
        id={prefix + "-title"}
        ref={titleRef}
        placeholder="Call the client, Request disclosure…"
        aria-label="What needs doing"
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select id={prefix + "-owner"} aria-label="Who" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">Unassigned</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <GameDateInput id={prefix + "-due"} aria-label="Due (in-game, optional)" value={due} onChange={setDue} />
      <button type="submit" className="btn" id={prefix + "-submit"}>
        {initial ? "Save" : "Add"}
      </button>
      {onCancel && (
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}
