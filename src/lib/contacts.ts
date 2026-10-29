// The firm's contacts (LP-30): everyone it deals with who isn't one of the
// user's own characters: clients, judges, officers, attorneys, witnesses and
// businesses. One list under lawapp_contacts on the store base; it syncs
// (merged per contact by `updated`, like precedents) and is in the full backup.

import { searchTerms } from "./precedents";
import { defaultKV, isId, ISO_TIME_RE, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";

export const CONTACTS_KEY = "lawapp_contacts";
export const CONTACTS_VERSION = 1;
export const MAX_CONTACTS = 2000;

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

export interface Contact {
  id: string;
  /** A person's name, or a business's. */
  name: string;
  type: ContactType;
  phone?: string;
  address?: string;
  organisation?: string;
  notes?: string;
  /** Real time, ISO: the newer copy wins a sync merge. */
  created: string;
  updated: string;
}

const isType = (v: unknown): v is ContactType => (CONTACT_TYPES as readonly unknown[]).includes(v);

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
  return {
    id: isId(o.id) ? o.id : newId(),
    name,
    type: isType(o.type) ? o.type : "client",
    ...(Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Partial<Contact>),
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

export interface ContactStore {
  /** A–Z by name. */
  list(): Contact[];
  get(id: string): Contact | null;
  /** Add or update a contact; returns it as saved. Throws when it has no name. */
  save(input: Partial<Contact> & { name: string }): Contact;
  remove(id: string): void;
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
      const c = cleanContact({ ...input, created: before?.created || now, updated: now }, now);
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
