// The firm's contacts (LP-30): everyone it deals with who isn't one of the
// user's own characters: clients, judges, officers, attorneys, witnesses and
// businesses. One list under lawapp_contacts on the store base; it syncs
// (merged per contact by `updated`, like precedents) and is in the full backup.
// A contact keeps its own links to Case File cases, each with its role there,
// so the links sync with it and the cases store never changes.

import { searchTerms } from "./precedents";
import { defaultKV, isId, ISO_TIME_RE, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";

export const CONTACTS_KEY = "lawapp_contacts";
export const CONTACTS_VERSION = 1;
export const MAX_CONTACTS = 2000;
/** Most cases one contact can be linked to. */
export const MAX_CASE_LINKS = 100;

export const CONTACT_TYPES = ["client", "judge", "officer", "attorney", "witness", "business"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  client: "Client",
  judge: "Judge",
  officer: "Officer",
  attorney: "Attorney",
  witness: "Witness",
  business: "Business",
};

export const CASE_ROLES = ["client", "opposing-party", "opposing-counsel", "witness", "judge", "officer", "other"] as const;
export type CaseRole = (typeof CASE_ROLES)[number];

export const CASE_ROLE_LABELS: Record<CaseRole, string> = {
  client: "Client",
  "opposing-party": "Opposing party",
  "opposing-counsel": "Opposing counsel",
  witness: "Witness",
  judge: "Judge",
  officer: "Officer",
  other: "Other",
};

/** A contact's part in one case. */
export interface CaseLink {
  /** The case's id. */
  id: string;
  role: CaseRole;
}

export interface Contact {
  id: string;
  /** A person's name, or a business's. */
  name: string;
  type: ContactType;
  phone?: string;
  address?: string;
  organisation?: string;
  notes?: string;
  /** The cases it's on (LP-30); absent when none. */
  cases?: CaseLink[];
  /** Real time, ISO: the newer copy wins a sync merge. */
  created: string;
  updated: string;
}

const isType = (v: unknown): v is ContactType => (CONTACT_TYPES as readonly unknown[]).includes(v);
const isRole = (v: unknown): v is CaseRole => (CASE_ROLES as readonly unknown[]).includes(v);

/** Untrusted links → one per case, each with a known role. */
function cleanLinks(raw: unknown): CaseLink[] {
  if (!Array.isArray(raw)) return [];
  const out: CaseLink[] = [];
  for (const l of raw) {
    if (!l || typeof l !== "object") continue;
    const { id, role } = l as Record<string, unknown>;
    if (isId(id) && !out.some((x) => x.id === id)) out.push({ id, role: isRole(role) ? role : "other" });
  }
  return out.slice(0, MAX_CASE_LINKS);
}

/** Normalise an untrusted contact (form, sync, backup); null without a name. */
export function cleanContact(input: unknown, now: string = new Date().toISOString()): Contact | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const name = text(o.name, 120);
  if (!name) return null;
  const fields = {
    phone: text(o.phone, 40),
    address: text(o.address, 200),
    organisation: text(o.organisation, 120),
    notes: text(o.notes, 2000),
  };
  const created = typeof o.created === "string" && ISO_TIME_RE.test(o.created) ? o.created : now;
  const cases = cleanLinks(o.cases);
  return {
    id: isId(o.id) ? o.id : newId(),
    name,
    type: isType(o.type) ? o.type : "client",
    ...(Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Partial<Contact>),
    ...(cases.length ? { cases } : {}),
    created,
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : created,
  };
}

/** A–Z by name. */
function order(list: Contact[]): Contact[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function validList(raw: unknown): Contact[] {
  return order(uniqueById(raw, cleanContact)).slice(0, MAX_CONTACTS);
}

const haystack = (c: Contact) =>
  [c.name, c.phone, c.address, c.organisation, c.notes, CONTACT_TYPE_LABELS[c.type]]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

/** Contacts with every search word somewhere (name, phone, address, organisation, notes, type), of the type if given. */
export function filterContacts(list: readonly Contact[], f: { q?: string; type?: ContactType | "" }): Contact[] {
  const terms = searchTerms(f.q || "");
  return list.filter((c) => {
    if (f.type && c.type !== f.type) return false;
    const h = haystack(c);
    return terms.every((t) => h.includes(t));
  });
}

/** The contacts on a case, with their role there, A–Z. */
export function contactsForCase(list: readonly Contact[], caseId: string): Array<{ contact: Contact; role: CaseRole }> {
  return list.flatMap((contact) => {
    const link = contact.cases?.find((l) => l.id === caseId);
    return link ? [{ contact, role: link.role }] : [];
  });
}

export interface ContactStore {
  /** A–Z by name. */
  list(): Contact[];
  get(id: string): Contact | null;
  /** Add or update a contact; returns it as saved. Keeps its case links unless `cases` is given. Throws when it has no name. */
  save(input: Partial<Contact> & { name: string }): Contact;
  remove(id: string): void;
  /** Put a contact on a case in a role (or change its role there). */
  link(contactId: string, caseId: string, role: CaseRole): void;
  /** Take a contact off a case. */
  unlink(contactId: string, caseId: string): void;
  /** Replace every contact (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createContactStore(kv: KV): ContactStore {
  const store = createStore<Contact[]>(kv, {
    key: CONTACTS_KEY,
    version: CONTACTS_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  return {
    list: () => store.get(),
    get: (id) => store.get().find((c) => c.id === id) || null,
    save(input) {
      const list = store.get();
      const before = input.id ? list.find((c) => c.id === input.id) : undefined;
      const now = new Date().toISOString();
      // An edit without `cases` (the Rolodex form) keeps the contact's case links.
      const c = cleanContact({ cases: before?.cases, ...input, created: before?.created || now, updated: now }, now);
      if (!c) throw new Error("Give the contact a name.");
      if (!before && list.length >= MAX_CONTACTS) {
        throw new Error("The Rolodex can hold up to " + MAX_CONTACTS + " contacts.");
      }
      store.set(order([...list.filter((x) => x.id !== c.id), c]));
      return c;
    },
    remove(id) {
      store.set(store.get().filter((c) => c.id !== id));
    },
    link(contactId, caseId, role) {
      const c = this.get(contactId);
      if (!c) throw new Error("That contact is no longer in the Rolodex.");
      const others = (c.cases || []).filter((l) => l.id !== caseId);
      if (others.length >= MAX_CASE_LINKS) throw new Error("A contact can be on up to " + MAX_CASE_LINKS + " cases.");
      this.save({ ...c, cases: [...others, { id: caseId, role }] });
    },
    unlink(contactId, caseId) {
      const c = this.get(contactId);
      if (c?.cases?.some((l) => l.id === caseId)) this.save({ ...c, cases: c.cases.filter((l) => l.id !== caseId) });
    },
    replaceAll(items) {
      store.set(validList(items));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: ContactStore | null = null;

/** The app's contacts (created on first use; client only). */
export function contactStore(): ContactStore {
  if (!instance) instance = createContactStore(defaultKV());
  return instance;
}
