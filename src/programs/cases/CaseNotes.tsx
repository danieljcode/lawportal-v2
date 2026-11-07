// A case's notes (LP-227): dated entries, newest first, each with who added it and when (game
// time). Add one, edit one, or delete one after asking. Each change saves the case straight away, as
// next actions do.

import { useState, type FormEvent } from "react";
import { caseStore } from "@/lib/cases";
import { MAX_NOTE, newCaseNote, noteWhen } from "@/lib/caseNotes";
import type { Case, CaseNote, Character } from "@/lib/types";

export default function CaseNotes({
  c,
  characters,
  active,
}: {
  c: Case;
  characters: Character[];
  active: Character | null;
}) {
  const list = c.caseNotes || [];
  const [editing, setEditing] = useState<string | null>(null);
  // Bumped after each add, so the add box starts empty again.
  const [added, setAdded] = useState(0);
  const [error, setError] = useState("");
  const nameOf = (id?: string) => (id ? characters.find((x) => x.id === id)?.name || "Unknown character" : "");

  const saveList = (caseNotes: CaseNote[]) => {
    try {
      caseStore().save({ ...c, caseNotes });
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const remove = (n: CaseNote) => {
    if (window.confirm("Delete this note? This can't be undone.")) saveList(list.filter((x) => x.id !== n.id));
  };

  return (
    <>
      <NoteForm
        key={added}
        id="note"
        label="Add a note"
        onSave={(body) => saveList([...list, newCaseNote(body, active?.id)]) && setAdded((k) => k + 1)}
      />
      <p className="error" role="alert" id="note-error">
        {error}
      </p>
      {list.length ? (
        <ul className="case-note-list" id="note-list">
          {[...list].reverse().map((n) => (
            <li key={n.id} className="case-note">
              <p className="small muted case-note-head">
                {noteWhen(n.at)}
                {n.by ? " · " + nameOf(n.by) : ""}
              </p>
              {editing === n.id ? (
                <NoteForm
                  id="note-edit"
                  label="Edit note"
                  initial={n.text}
                  onSave={(body) =>
                    saveList(list.map((x) => (x.id === n.id ? { ...x, text: body } : x))) && setEditing(null)
                  }
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <p className="case-note-text">{n.text}</p>
                  <span className="action-buttons">
                    <button type="button" className="mini" aria-label="Edit note" onClick={() => setEditing(n.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="mini danger-quiet"
                      aria-label="Delete note"
                      onClick={() => remove(n)}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted" id="note-none">
          No notes yet. Add what happened, like a call with the client, and it&apos;s dated for you.
        </p>
      )}
    </>
  );
}

function NoteForm({
  id,
  label,
  initial = "",
  onSave,
  onCancel,
}: {
  id: string;
  label: string;
  initial?: string;
  onSave(body: string): void;
  onCancel?(): void;
}) {
  const [body, setBody] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) onSave(body.trim());
  };
  return (
    <form className="case-note-form" onSubmit={submit}>
      <label className="field" htmlFor={id + "-text"}>
        <span className="sr-only">{label}</span>
        <textarea
          id={id + "-text"}
          rows={3}
          maxLength={MAX_NOTE}
          placeholder={onCancel ? undefined : "Add a note…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          autoFocus={!!onCancel}
        />
      </label>
      <div className="row">
        <button type="submit" className="btn primary" id={id + "-save"} disabled={!body.trim()}>
          {onCancel ? "Save note" : "+ Add note"}
        </button>
        {onCancel && (
          <button type="button" className="btn" id={id + "-cancel"} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
