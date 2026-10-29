// A case's contacts from the Rolodex (LP-30): who's on it and in what role,
// linked or unlinked here. The links are kept on each contact, so each change
// saves that contact straight away. Behind the `rolodex` flag.

import { useMemo, useState, type FormEvent } from "react";
import {
  CASE_ROLE_LABELS,
  CASE_ROLES,
  CONTACT_TYPE_LABELS,
  contactsForCase,
  contactStore,
  type CaseRole,
} from "@/lib/contacts";
import type { Case } from "@/lib/types";
import { useContactVersion } from "@/ui/useStore";

export default function CaseContacts({ c }: { c: Case }) {
  const version = useContactVersion();
  const all = useMemo(() => (version >= 0 ? contactStore().list() : []), [version]);
  const linked = useMemo(() => contactsForCase(all, c.id), [all, c.id]);
  const unlinked = all.filter((x) => !linked.some((l) => l.contact.id === x.id));
  const [picked, setPicked] = useState("");
  const [role, setRole] = useState<CaseRole>("client");
  const [error, setError] = useState("");

  const run = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!picked) {
      setError("Pick a contact from the Rolodex.");
      return;
    }
    run(() => contactStore().link(picked, c.id, role));
    setPicked("");
  };

  if (!all.length) {
    return (
      <p className="small muted" id="case-contacts-empty">
        No contacts yet. Add them in the <a href="#clients/rolodex">Rolodex</a>, then link them here.
      </p>
    );
  }

  return (
    <>
      {linked.length ? (
        <ul className="case-contact-list" id="case-contact-list">
          {linked.map(({ contact, role: r }) => (
            <li key={contact.id} className="case-contact">
              <span>
                <strong>{contact.name}</strong>{" "}
                <span className="small muted">
                  {[CASE_ROLE_LABELS[r], CONTACT_TYPE_LABELS[contact.type], contact.phone].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button
                type="button"
                className="mini"
                aria-label={"Unlink " + contact.name}
                onClick={() => run(() => contactStore().unlink(contact.id, c.id))}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No contacts linked to this case yet.</p>
      )}
      {unlinked.length > 0 && (
        <form className="row case-contact-add" onSubmit={add}>
          <select
            id="case-contact-pick"
            aria-label="Contact"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">Pick a contact…</option>
            {unlinked.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name + " (" + CONTACT_TYPE_LABELS[x.type] + ")"}
              </option>
            ))}
          </select>
          <select
            id="case-contact-role"
            aria-label="Role on this case"
            value={role}
            onChange={(e) => setRole(e.target.value as CaseRole)}
          >
            {CASE_ROLES.map((r) => (
              <option key={r} value={r}>
                {CASE_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" id="case-contact-link">
            Link contact
          </button>
        </form>
      )}
      <p className="error" role="alert" id="case-contact-error">
        {error}
      </p>
    </>
  );
}
