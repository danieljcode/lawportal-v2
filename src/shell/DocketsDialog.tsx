// A character's docket (FR11 dialog part, INV §a #dockets-dialog): search,
// status filter, the case list with its actions, and the New/Edit form.

import { useState, type FormEvent } from "react";
import { COURTS } from "@/data/form-index";
import { characterStore } from "@/lib/characters";
import { docketStore, FIELDS, STATUSES } from "@/lib/dockets";
import { formatDate } from "@/lib/template";
import type { Docket } from "@/lib/types";
import Dialog from "@/ui/Dialog";
import { useDocketVersion } from "@/ui/useStore";

export interface DocketsDialogProps {
  open: boolean;
  onClose(): void;
  /** Whose docket to show. */
  charId: string | null;
  /** "Use in form" is offered (a form with a Case number is open and this is the active character's docket). */
  canUse: boolean;
  /** Load a case into the open form (the dialog closes first). */
  onUse(docketId: string): void;
}

export default function DocketsDialog(p: DocketsDialogProps) {
  const c = p.charId ? characterStore().get(p.charId) : null;
  return (
    <Dialog
      open={p.open}
      onClose={p.onClose}
      id="dockets-dialog"
      titleId="dockets-title"
      title={c ? c.name + "'s docket" : "Docket"}
    >
      {p.charId && <DocketsBody {...p} charId={p.charId} />}
    </Dialog>
  );
}

const FILTERS: Array<[string, string]> = [
  ["active", "Not closed"],
  ["", "All statuses"],
  ...STATUSES.map((s): [string, string] => [s, s]),
];

type FormValues = Record<string, string>;

interface Editing {
  id: string | null;
  values: FormValues;
  error: string;
}

function startEdit(d: Docket | null): Editing {
  const values: FormValues = {};
  const src = (d || { status: "Open" }) as unknown as Record<string, unknown>;
  for (const f of FIELDS) values[f.key] = typeof src[f.key] === "string" ? (src[f.key] as string) : "";
  return { id: d ? d.id : null, values, error: "" };
}

function DocketsBody({ charId, canUse, onUse, onClose }: DocketsDialogProps & { charId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<Editing | null>(null);
  useDocketVersion(); // re-read the list after any docket change

  const store = docketStore();
  const all = store.list(charId);
  const query = q.trim().toLowerCase();
  const items = all.filter((d) => {
    if (status === "active" && d.status === "Closed") return false;
    if (status && status !== "active" && d.status !== status) return false;
    return !query || JSON.stringify(d).toLowerCase().includes(query);
  });

  const edit = (d: Docket | null) => {
    setEditing(startEdit(d));
    requestAnimationFrame(() => document.getElementById("docket-caseNumber")?.focus());
  };

  const setField = (key: string, value: string) =>
    setEditing((e) => (e ? { ...e, values: { ...e.values, [key]: value } } : e));

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      store.save(charId, { ...editing.values, id: editing.id || undefined });
      setEditing(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setEditing((x) => (x ? { ...x, error: message } : x));
    }
  };

  const closeCase = (d: Docket) => {
    try {
      store.save(charId, { ...d, status: "Closed" });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = (d: Docket) => {
    if (!confirm("Remove " + d.caseNumber + " from the docket?")) return;
    store.remove(charId, d.id);
    if (editing && editing.id === d.id) setEditing(null);
  };

  const use = (d: Docket) => {
    onClose();
    onUse(d.id);
  };

  return (
    <>
      <p className="muted small">
        Cases this character is handling. Saved with your characters (and synced if you&apos;ve turned sync on).
      </p>
      <div className="docket-tools">
        <input
          type="search"
          id="docket-search"
          placeholder="Search case number, party, notes…"
          aria-label="Search dockets"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          id="docket-filter"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {FILTERS.map(([value, label]) => (
            <option key={value || "all"} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" id="new-docket" onClick={() => edit(null)}>
          New docket
        </button>
      </div>
      <div className="char-layout">
        <ul className="char-list docket-list" id="docket-list">
          {!items.length && (
            <li className="muted small">
              {all.length ? "No cases match." : "No cases yet. Add one here, or use “Save to docket” on any form."}
            </li>
          )}
          {items.map((d) => {
            const parties = [d.plaintiff, d.defendant].filter(Boolean).join(" v. ");
            const next = [d.nextEvent, d.nextDate ? formatDate(d.nextDate, "long") : ""].filter(Boolean).join(" — ");
            return (
              <li key={d.id} className={d.status === "Closed" ? "closed" : ""}>
                <div className="char-name">
                  <strong>{d.caseNumber}</strong>
                  <span className="tag">{d.status}</span>
                  {d.court && <span className="muted small">{d.court}</span>}
                </div>
                {parties && <div className="small">{parties}</div>}
                {d.filed && <div className="small muted">{"Filed " + formatDate(d.filed, "long")}</div>}
                {next && <div className="small muted">{"Next: " + next}</div>}
                {/^https?:\/\//i.test(d.link || "") && (
                  <a className="small" href={d.link} target="_blank" rel="noopener noreferrer">
                    Forum thread
                  </a>
                )}
                <div className="char-actions">
                  {canUse && (
                    <button type="button" className="mini" onClick={() => use(d)}>
                      Use in form
                    </button>
                  )}
                  <button type="button" className="mini" onClick={() => edit(d)}>
                    Edit
                  </button>
                  {d.status !== "Closed" && (
                    <button type="button" className="mini" onClick={() => closeCase(d)}>
                      Close case
                    </button>
                  )}
                  <button type="button" className="mini danger-quiet" onClick={() => remove(d)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {editing && (
          <form id="docket-form" className="char-form" noValidate onSubmit={save} aria-labelledby="docket-form-title">
            <h3 id="docket-form-title">
              {editing.id ? "Edit " + (store.get(charId, editing.id)?.caseNumber || "docket") : "New docket"}
            </h3>
            <div id="docket-fields">
              {FIELDS.map((f) => {
                const fid = "docket-" + f.key;
                const value = editing.values[f.key] || "";
                const describedBy = f.hint ? fid + "-help" : undefined;
                let input;
                if (f.options) {
                  input = (
                    <select id={fid} value={value} onChange={(e) => setField(f.key, e.target.value)}>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  );
                } else if (f.multiline) {
                  input = (
                    <textarea id={fid} rows={3} value={value} onChange={(e) => setField(f.key, e.target.value)} />
                  );
                } else {
                  input = (
                    <input
                      id={fid}
                      type={f.type || "text"}
                      required={f.required}
                      aria-required={f.required || undefined}
                      aria-describedby={describedBy}
                      list={f.key === "court" ? "court-names" : undefined}
                      value={value}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  );
                }
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={fid}>{f.label + (f.required ? " *" : "")}</label>
                    {input}
                    {f.hint && (
                      <p className="help" id={describedBy}>
                        {f.hint}
                      </p>
                    )}
                  </div>
                );
              })}
              <datalist id="court-names">
                {COURTS.map((court) => (
                  <option key={court} value={court} />
                ))}
              </datalist>
            </div>
            <p className="error" id="docket-error" role="alert">
              {editing.error}
            </p>
            <div className="row">
              <button className="btn primary" type="submit">
                Save
              </button>
              <button className="btn" type="button" id="cancel-docket" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
