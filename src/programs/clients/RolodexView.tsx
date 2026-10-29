// The Rolodex (LP-30): the firm's contacts, one card each, with a search box,
// a type filter, and a form to add or edit one; each card links the cases
// the contact is on. Behind the `rolodex` flag.

import { useMemo, useState, type FormEvent } from "react";
import { caseStore } from "@/lib/cases";
import {
  CASE_ROLE_LABELS,
  CONTACT_TYPE_LABELS,
  CONTACT_TYPES,
  contactStore,
  filterContacts,
  type Contact,
  type ContactType,
} from "@/lib/contacts";
import { searchTerms } from "@/lib/precedents";
import Marked from "@/ui/Marked";
import { useCaseVersion, useContactVersion } from "@/ui/useStore";

interface Draft {
  name: string;
  type: ContactType;
  phone: string;
  address: string;
  organisation: string;
  notes: string;
}

const EMPTY: Draft = { name: "", type: "client", phone: "", address: "", organisation: "", notes: "" };

const draftOf = (c: Contact): Draft => ({
  name: c.name,
  type: c.type,
  phone: c.phone || "",
  address: c.address || "",
  organisation: c.organisation || "",
  notes: c.notes || "",
});

/** Add or edit one contact. */
function ContactForm({ editing, onDone }: { editing: Contact | null; onDone(): void }) {
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftOf(editing) : EMPTY));
  const [error, setError] = useState("");
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    try {
      contactStore().save({ ...(editing ? { id: editing.id } : {}), ...draft });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="case-form contact-form" id="contact-form" noValidate onSubmit={submit}>
      <h4>{editing ? "Edit contact" : "Add a contact"}</h4>
      <div className="case-fields">
        <div className="field">
          <label htmlFor="contact-name">Name</label>
          <input id="contact-name" value={draft.name} onChange={set("name")} />
        </div>
        <div className="field">
          <label htmlFor="contact-type">Type</label>
          <select id="contact-type" value={draft.type} onChange={set("type")}>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="contact-phone">Phone</label>
          <input id="contact-phone" inputMode="tel" value={draft.phone} onChange={set("phone")} />
        </div>
        <div className="field">
          <label htmlFor="contact-organisation">Organisation</label>
          <input id="contact-organisation" value={draft.organisation} onChange={set("organisation")} />
        </div>
      </div>
      <div className="field wide">
        <label htmlFor="contact-address">Address</label>
        <input id="contact-address" value={draft.address} onChange={set("address")} />
      </div>
      <div className="field wide">
        <label htmlFor="contact-notes">Notes</label>
        <textarea id="contact-notes" rows={3} value={draft.notes} onChange={set("notes")} />
      </div>
      <p className="error" role="alert" id="contact-error">
        {error}
      </p>
      <div className="row">
        <button type="submit" className="btn primary" id="contact-save">
          {editing ? "Save contact" : "Add contact"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function RolodexView() {
  const version = useContactVersion();
  const all = useMemo(() => (version >= 0 ? contactStore().list() : []), [version]);
  const caseVersion = useCaseVersion();
  /** Case id → its number, for the cards' case links. */
  const caseNumbers = useMemo(
    () => new Map((caseVersion >= 0 ? caseStore().list() : []).map((k) => [k.id, k.caseNumber])),
    [caseVersion],
  );
  const [q, setQ] = useState("");
  const [type, setType] = useState<ContactType | "">("");
  const terms = useMemo(() => searchTerms(q), [q]);
  const shown = useMemo(() => filterContacts(all, { q, type }), [all, q, type]);
  /** The contact being edited, "new" for the add form, or null. */
  const [editing, setEditing] = useState<Contact | "new" | null>(null);

  const remove = (c: Contact) => {
    if (confirm("Delete " + c.name + " from the Rolodex?")) contactStore().remove(c.id);
  };

  return (
    <section id="rolodex" className="form-view rolodex">
      <div className="form-head">
        <div>
          <p className="crumb muted">Clients</p>
          <h2 id="rolodex-title">Rolodex</h2>
        </div>
      </div>
      <div className="row rolodex-head">
        <p className="small muted">
          Everyone the firm deals with: clients, judges, officers, attorneys and businesses.
        </p>
        {!editing && (
          <button type="button" className="btn" id="contact-new" onClick={() => setEditing("new")}>
            Add contact
          </button>
        )}
      </div>
      {editing && (
        <ContactForm
          key={editing === "new" ? "new" : editing.id}
          editing={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {all.length ? (
        <>
          <div className="row rolodex-filters">
            <input
              type="search"
              id="rolodex-q"
              placeholder="Search: name, phone, address or notes"
              aria-label="Search contacts"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              id="rolodex-type"
              aria-label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as ContactType | "")}
            >
              <option value="">All types</option>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <p className="small muted" id="rolodex-count">
            {shown.length === all.length
              ? all.length + (all.length === 1 ? " contact" : " contacts")
              : shown.length + " of " + all.length + " contacts"}
          </p>
          {shown.length ? (
            <ul className="contact-list" id="rolodex-list">
              {shown.map((c) => (
                <li key={c.id} className="contact-card">
                  <div className="contact-head">
                    <strong>
                      <Marked text={c.name} terms={terms} />
                    </strong>
                    <span className="tag">{CONTACT_TYPE_LABELS[c.type]}</span>
                    <span className="contact-actions">
                      <button type="button" className="mini" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button type="button" className="mini danger-quiet" onClick={() => remove(c)}>
                        Delete
                      </button>
                    </span>
                  </div>
                  {[c.organisation, c.phone, c.address].filter(Boolean).map((line, i) => (
                    <p key={i} className="small">
                      <Marked text={line!} terms={terms} />
                    </p>
                  ))}
                  {c.notes && (
                    <p className="small muted">
                      <Marked text={c.notes} terms={terms} />
                    </p>
                  )}
                  {c.cases?.some((l) => caseNumbers.has(l.id)) && (
                    <p className="small contact-cases">
                      {c.cases
                        .filter((l) => caseNumbers.has(l.id))
                        .map((l, i) => (
                          <span key={l.id}>
                            {i > 0 && " · "}
                            <a href={"#cases/" + l.id}>{caseNumbers.get(l.id)}</a> ({CASE_ROLE_LABELS[l.role]})
                          </span>
                        ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" id="rolodex-none">
              No contacts match. Try fewer words or another type.
            </p>
          )}
        </>
      ) : (
        !editing && (
          <p className="small muted" id="rolodex-empty">
            No contacts yet. Add the people and businesses the firm deals with.
          </p>
        )
      )}
    </section>
  );
}
