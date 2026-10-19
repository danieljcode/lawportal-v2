// The Case File (LP-101): every firm case and who's working it. #cases lists
// them with a search and filters; #cases/<id> opens one to edit its details,
// its lead and the other characters on it. Side by side on a wide screen; on a
// phone the case replaces the list, with a link back.

import { useMemo, useState, type FormEvent } from "react";
import { caseProblem, caseStore, filterCases, members, needsLead, NEEDS_LEAD } from "@/lib/cases";
import { FIELDS, STATUSES } from "@/lib/docketFields";
import type { Case, Character } from "@/lib/types";
import { useCaseVersion } from "./useStore";

export interface CaseFileViewProps {
  /** The case open from the route (#cases/<id>), or null for just the list. */
  caseId: string | null;
  characters: Character[];
}

export default function CaseFileView({ caseId, characters }: CaseFileViewProps) {
  const version = useCaseVersion();
  const all = useMemo(() => (version >= 0 ? caseStore().list() : []), [version]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [charId, setCharId] = useState("");
  const [creating, setCreating] = useState(false);
  /** "Saved." for the case just saved (kept here: the editor remounts on every save). */
  const [savedId, setSavedId] = useState<string | null>(null);
  const shown = useMemo(() => filterCases(all, { q, status, charId }), [all, q, status, charId]);
  const selected = caseId ? all.find((c) => c.id === caseId) || null : null;
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name || "Unknown character";
  const filtered = !!(q || status || charId);

  // A case opened from the list replaces a half-made new one.
  const [openedFor, setOpenedFor] = useState(caseId);
  if (openedFor !== caseId) {
    setOpenedFor(caseId);
    setCreating(false);
    if (savedId !== caseId) setSavedId(null);
  }

  const onSaved = (saved: Case, isNew: boolean) => {
    setSavedId(saved.id);
    if (isNew) {
      setCreating(false);
      location.hash = "#cases/" + saved.id;
    }
  };

  let detail: React.ReactNode;
  if (creating) {
    detail = (
      <CaseEditor
        key="new"
        initial={null}
        characters={characters}
        onSaved={onSaved}
        onCancel={() => setCreating(false)}
      />
    );
  } else if (selected) {
    // Re-keyed on every save (here, or synced in), so the form shows what's stored.
    detail = (
      <CaseEditor
        key={selected.id + ":" + selected.updated}
        initial={selected}
        characters={characters}
        saved={savedId === selected.id}
        onSaved={onSaved}
        onCancel={() => {}}
      />
    );
  } else if (caseId) {
    detail = (
      <p className="case-placeholder" id="case-missing">
        That case isn&apos;t in the Case File any more.
      </p>
    );
  } else {
    detail = (
      <p className="case-placeholder muted">
        {all.length ? "Pick a case to see it, or add a new one." : "Add the firm's first case to get started."}
      </p>
    );
  }

  return (
    <section id="case-file" className={"form-view case-file" + (caseId || creating ? " has-detail" : "")}>
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="case-file-title">Case File</h2>
        </div>
        <div className="form-head-actions">
          <button type="button" className="btn primary" id="case-new" onClick={() => setCreating(true)}>
            New case
          </button>
        </div>
      </div>

      <div className="case-layout">
        <div className="case-list-pane">
          <div className="case-filters" role="search">
            <input
              type="search"
              id="case-search"
              placeholder="Case number or party…"
              aria-label="Search cases by case number or party"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              id="case-filter-status"
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={NEEDS_LEAD}>Needs a lead</option>
            </select>
            <select
              id="case-filter-character"
              aria-label="Character"
              value={charId}
              onChange={(e) => setCharId(e.target.value)}
            >
              <option value="">Anyone</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="small muted" id="case-count">
            {filtered
              ? shown.length + " of " + all.length + " cases"
              : all.length + (all.length === 1 ? " case" : " cases")}
          </p>
          {shown.length ? (
            <ul className="case-list" id="case-list">
              {shown.map((c) => (
                <li key={c.id}>
                  <a
                    href={"#cases/" + c.id}
                    className={"case-row" + (c.id === caseId ? " current" : "")}
                    aria-current={c.id === caseId ? "page" : undefined}
                  >
                    <span className="case-row-head">
                      <strong className="case-num">{c.caseNumber}</strong>
                      <span className="case-status">{c.status}</span>
                      {needsLead(c) && <span className="tag req">Needs a lead</span>}
                    </span>
                    {(c.plaintiff || c.defendant) && (
                      <span className="case-parties">{[c.plaintiff, c.defendant].filter(Boolean).join(" v. ")}</span>
                    )}
                    <span className="small muted">
                      {[
                        c.court,
                        c.lead ? "Lead: " + nameOf(c.lead) : "",
                        c.assigned.length ? "Also: " + c.assigned.map(nameOf).join(", ") : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" id="case-none">
              {all.length ? "No cases match." : "No cases yet."}
            </p>
          )}
        </div>

        <div className="case-detail">
          {(caseId || creating) && (
            <a className="case-back" href="#cases" onClick={() => setCreating(false)}>
              ← All cases
            </a>
          )}
          {detail}
        </div>
      </div>
    </section>
  );
}

type Values = Partial<Record<(typeof FIELDS)[number]["key"], string>>;

interface CaseEditorProps {
  /** The stored case, or null for a new one. */
  initial: Case | null;
  characters: Character[];
  /** Show "Saved." (this case was just saved). */
  saved?: boolean;
  onSaved(saved: Case, isNew: boolean): void;
  /** Cancel a new case. */
  onCancel(): void;
}

function CaseEditor({ initial, characters, saved, onSaved, onCancel }: CaseEditorProps) {
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of FIELDS) v[f.key] = initial ? (initial[f.key] as string | undefined) || "" : "";
    if (!initial) v.status = STATUSES[0];
    return v;
  });
  const [lead, setLead] = useState<string>(initial?.lead || "");
  const [assigned, setAssigned] = useState<string[]>(initial?.assigned || []);
  const [error, setError] = useState("");
  const [edited, setEdited] = useState(false);

  // Characters on the case that this browser doesn't have (from another device) still show.
  const known = new Set(characters.map((c) => c.id));
  const people = [
    ...characters.map((c) => ({ id: c.id, name: c.name })),
    ...(initial ? members(initial) : [])
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: "Unknown character" })),
  ];

  const set = (key: keyof Values, v: string) => {
    setValues((x) => ({ ...x, [key]: v }));
    setEdited(true);
  };

  const pickLead = (id: string) => {
    setLead(id);
    setAssigned((a) => a.filter((x) => x !== id));
    setEdited(true);
  };

  const toggle = (id: string, on: boolean) => {
    setAssigned((a) => (on ? [...a, id] : a.filter((x) => x !== id)));
    setEdited(true);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const store = caseStore();
    const draft = { id: initial?.id || "", caseNumber: (values.caseNumber || "").trim() };
    const problem = caseProblem(draft, store.list());
    if (problem) {
      setError(problem);
      return;
    }
    const data: Record<string, unknown> = { ...(initial || {}), lead: lead || null, assigned };
    for (const f of FIELDS) {
      if (values[f.key]) data[f.key] = values[f.key];
      else delete data[f.key];
    }
    try {
      onSaved(store.save(data), !initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = () => {
    if (!initial) return;
    if (!confirm("Delete case " + initial.caseNumber + " from the Case File? This cannot be undone.")) return;
    caseStore().remove(initial.id);
    location.hash = "#cases";
  };

  return (
    <form id="case-form" className="case-form" noValidate onSubmit={save} aria-labelledby="case-form-title">
      <h3 id="case-form-title">{initial ? initial.caseNumber : "New case"}</h3>
      {initial && !initial.lead && (
        <p className="case-flag" id="case-needs-lead">
          This case has no lead. Pick one below.
        </p>
      )}
      <div className="case-fields">
        {FIELDS.map((f) => {
          const fid = "case-" + f.key;
          const value = values[f.key] || "";
          let input: React.ReactNode;
          if (f.options) {
            input = (
              <select id={fid} value={value} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          } else if (f.multiline) {
            input = <textarea id={fid} rows={4} value={value} onChange={(e) => set(f.key, e.target.value)} />;
          } else {
            input = (
              <input
                id={fid}
                type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                value={value}
                required={f.required}
                aria-required={f.required || undefined}
                onChange={(e) => set(f.key, e.target.value)}
              />
            );
          }
          return (
            <div className={"field" + (f.multiline ? " wide" : "")} key={f.key}>
              <label htmlFor={fid}>{f.label + (f.required ? " *" : "")}</label>
              {input}
              {f.hint && <p className="help">{f.hint}</p>}
            </div>
          );
        })}
      </div>

      <fieldset className="case-people">
        <legend>Who&apos;s on it</legend>
        <div className="field">
          <label htmlFor="case-lead">Lead</label>
          <select id="case-lead" value={lead} onChange={(e) => pickLead(e.target.value)}>
            <option value="">— no lead —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="small muted">Also working it:</p>
        {people.filter((p) => p.id !== lead).length ? (
          <ul className="case-assigned" id="case-assigned">
            {people
              .filter((p) => p.id !== lead)
              .map((p) => (
                <li key={p.id}>
                  <label className="field check">
                    <input
                      type="checkbox"
                      checked={assigned.includes(p.id)}
                      onChange={(e) => toggle(p.id, e.target.checked)}
                    />
                    <span>{p.name}</span>
                  </label>
                </li>
              ))}
          </ul>
        ) : (
          <p className="small muted">Add characters in the Characters dialog to assign them.</p>
        )}
      </fieldset>

      <p className="error" id="case-error" role="alert">
        {error}
      </p>
      <div className="row">
        <button className="btn primary" type="submit" id="case-save">
          {initial ? "Save" : "Add case"}
        </button>
        {!initial && (
          <button className="btn" type="button" id="case-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        {initial && (
          <button className="btn danger-quiet" type="button" id="case-delete" onClick={remove}>
            Delete case
          </button>
        )}
        <span className="small good" role="status" id="case-saved">
          {saved && !edited ? "Saved." : ""}
        </span>
      </div>

      {initial && (
        <div className="case-links">
          <section className="case-empty" id="case-filings" aria-labelledby="case-filings-title">
            <h4 id="case-filings-title">Filings</h4>
            <p className="small muted">No filings yet. Filings posted for this case will be listed here.</p>
          </section>
          <section className="case-empty" id="case-evidence" aria-labelledby="case-evidence-title">
            <h4 id="case-evidence-title">Evidence</h4>
            <p className="small muted">No evidence yet. Exhibits for this case will be kept here.</p>
          </section>
          <section className="case-empty" id="case-deadlines" aria-labelledby="case-deadlines-title">
            <h4 id="case-deadlines-title">Deadlines</h4>
            <p className="small muted">No deadlines yet. Hearing dates and deadlines for this case will show here.</p>
          </section>
        </div>
      )}
    </form>
  );
}
