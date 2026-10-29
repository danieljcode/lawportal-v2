// A case's exhibits (LP-12): lettered by their order (A, B… Z, AA…), with a
// title, description, link and date obtained. Add, edit, reorder and delete;
// each change saves the case straight away (like its deadlines). Links are
// shown only when they're http(s), and are never fetched. Each exhibit has a
// chain-of-custody log (LP-14), opened with its Custody button.

import { useState, type FormEvent } from "react";
import { caseStore } from "@/lib/cases";
import { formatDay } from "@/lib/deadlines";
import { cleanExhibit, exhibitLetter, MAX_EXHIBITS, moveExhibit, safeLink } from "@/lib/exhibits";
import type { Case, Character, Exhibit } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";
import ExhibitCustody from "./ExhibitCustody";

interface Draft {
  title: string;
  description: string;
  link: string;
  obtained: string;
}

const EMPTY: Draft = { title: "", description: "", link: "", obtained: "" };

const draftOf = (e: Exhibit): Draft => ({
  title: e.title,
  description: e.description || "",
  link: e.link || "",
  obtained: e.obtained || "",
});

export interface CaseEvidenceProps {
  c: Case;
  /** For the custody log's "Handled by" (LP-14). */
  characters?: Character[];
  active?: Character | null;
}

export default function CaseEvidence({ c, characters = [], active = null }: CaseEvidenceProps) {
  /** The exhibit being edited, or "new" for the add form. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState("");
  /** Exhibits with their custody log open. */
  const [custodyOpen, setCustodyOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleCustody = (id: string) =>
    setCustodyOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const saveList = (exhibits: Exhibit[]): boolean => {
    try {
      caseStore().save({ ...c, exhibits });
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const open = (id: string | null) => {
    setEditing(id);
    const e = id && id !== "new" ? c.exhibits.find((x) => x.id === id) : undefined;
    setDraft(e ? draftOf(e) : EMPTY);
    setError("");
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!draft.title.trim()) {
      setError("Give the exhibit a title.");
      return;
    }
    if (draft.link.trim() && !safeLink(draft.link)) {
      setError("The link must start with http:// or https://.");
      return;
    }
    const isNew = editing === "new";
    if (isNew && c.exhibits.length >= MAX_EXHIBITS) {
      setError("A case can hold up to " + MAX_EXHIBITS + " exhibits.");
      return;
    }
    // Editing keeps the exhibit's custody log; only the details change.
    const before = isNew ? undefined : c.exhibits.find((x) => x.id === editing);
    const e = cleanExhibit({ ...before, ...draft, id: isNew ? undefined : editing });
    if (!e) return;
    const list = isNew ? [...c.exhibits, e] : c.exhibits.map((x) => (x.id === e.id ? e : x));
    if (saveList(list)) open(null);
  };

  const remove = (e: Exhibit, letter: string) => {
    if (!confirm("Delete Exhibit " + letter + " (" + e.title + ")? The exhibits after it are relettered.")) return;
    saveList(c.exhibits.filter((x) => x.id !== e.id));
    if (editing === e.id) open(null);
  };

  const form = (
    <form className="exhibit-form" id="exhibit-form" noValidate onSubmit={submit} aria-label="Exhibit">
      <input
        type="text"
        id="exhibit-title"
        placeholder="Title, e.g. Dashcam footage"
        aria-label="Title"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <input
        type="url"
        id="exhibit-link"
        placeholder="Link (image, video, document): https://…"
        aria-label="Link"
        value={draft.link}
        onChange={(e) => setDraft({ ...draft, link: e.target.value })}
      />
      <GameDateInput
        id="exhibit-obtained"
        aria-label="Date obtained (in-game)"
        value={draft.obtained}
        onChange={(v) => setDraft({ ...draft, obtained: v })}
      />
      <textarea
        id="exhibit-description"
        rows={2}
        placeholder="Description (optional)"
        aria-label="Description"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <div className="row">
        <button type="submit" className="btn primary" id="exhibit-save">
          {editing === "new" ? "Add exhibit" : "Save exhibit"}
        </button>
        <button type="button" className="btn" onClick={() => open(null)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <>
      {c.exhibits.length ? (
        <ol className="exhibit-list" id="exhibit-list">
          {c.exhibits.map((e, i) => {
            const letter = exhibitLetter(i);
            const link = safeLink(e.link);
            return (
              <li key={e.id} className="exhibit">
                <div className="exhibit-head">
                  <strong className="exhibit-letter">{"Exhibit " + letter}</strong>
                  <span className="exhibit-title">{e.title}</span>
                  <span className="exhibit-actions">
                    <button
                      type="button"
                      className="mini"
                      aria-label={"Move Exhibit " + letter + " up"}
                      disabled={i === 0}
                      onClick={() => saveList(moveExhibit(c.exhibits, e.id, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="mini"
                      aria-label={"Move Exhibit " + letter + " down"}
                      disabled={i === c.exhibits.length - 1}
                      onClick={() => saveList(moveExhibit(c.exhibits, e.id, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="mini"
                      aria-expanded={custodyOpen.has(e.id)}
                      onClick={() => toggleCustody(e.id)}
                    >
                      {"Custody (" + (e.custody?.length || 0) + ")"}
                    </button>
                    <button type="button" className="mini" onClick={() => open(e.id)}>
                      Edit
                    </button>
                    <button type="button" className="mini danger-quiet" onClick={() => remove(e, letter)}>
                      Delete
                    </button>
                  </span>
                </div>
                {(e.obtained || link) && (
                  <p className="small muted">
                    {e.obtained && "Obtained " + formatDay(e.obtained)}
                    {e.obtained && link && " · "}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer nofollow">
                        {link}
                      </a>
                    )}
                  </p>
                )}
                {e.description && <p className="small exhibit-description">{e.description}</p>}
                {editing === e.id && form}
                {custodyOpen.has(e.id) && (
                  <ExhibitCustody
                    exhibit={e}
                    letter={letter}
                    characters={characters}
                    active={active}
                    onSave={(custody) => saveList(c.exhibits.map((x) => (x.id === e.id ? { ...x, custody } : x)))}
                  />
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="small muted" id="exhibit-empty">
          No exhibits yet. Add the evidence for this case: each exhibit gets a letter (A, B, C…).
        </p>
      )}
      {editing === "new" ? (
        form
      ) : (
        <button type="button" className="btn" id="exhibit-new" onClick={() => open("new")}>
          Add exhibit
        </button>
      )}
      <p className="error" role="alert" id="exhibit-error">
        {error}
      </p>
    </>
  );
}
