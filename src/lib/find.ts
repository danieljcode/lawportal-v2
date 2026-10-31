// Find (LP-95): one search over the firm's records — cases, contacts, filings,
// exhibits, invoices and time entries — grouped by type. Every search word must
// appear somewhere in a record, ignoring case; a case number matches with or
// without its dashes. Records are turned into searchable text once (findIndex),
// so searching as you type stays quick with thousands of them. Pure.

import type { Contact } from "./contacts";
import { CONTACT_TYPE_LABELS } from "./contacts";
import { formatDay } from "./deadlines";
import { exhibitLetter } from "./exhibits";
import type { Filing } from "./filings";
import { invoiceStatus, type Invoice } from "./invoices";
import { ACTIVITY_LABELS, type TimeEntry } from "./ledger";
import { searchTerms } from "./precedents";
import type { Case } from "./types";

export const FIND_KINDS = ["case", "contact", "filing", "exhibit", "invoice", "time"] as const;
export type FindKind = (typeof FIND_KINDS)[number];

export const FIND_LABELS: Record<FindKind, string> = {
  case: "Cases",
  contact: "Contacts",
  filing: "Filings",
  exhibit: "Exhibits",
  invoice: "Invoices",
  time: "Time",
};

/** Most results listed in one group; the rest are counted. */
export const MAX_PER_GROUP = 20;

export interface FindItem {
  /** Unique, and safe in an element id. */
  id: string;
  kind: FindKind;
  title: string;
  detail: string;
  href: string;
  /** Lowercase, and again without dashes or spaces, so "90-sc-cr" finds "90SCCR". */
  text: string;
}

export interface FindSources {
  cases: readonly Case[];
  contacts: readonly Contact[];
  filings: readonly Filing[];
  invoices: readonly Invoice[];
  time: readonly TimeEntry[];
  /** A character's name, for filings and time. */
  nameOf(characterId: string): string;
}

const item = (o: Omit<FindItem, "text">, ...more: Array<string | undefined>): FindItem => {
  const all = [o.title, o.detail, ...more].filter(Boolean).join("\n").toLowerCase();
  return { ...o, text: all + "\n" + all.replace(/[-\s]+/g, "") };
};

const parties = (c: Pick<Case, "plaintiff" | "defendant">) => [c.plaintiff, c.defendant].filter(Boolean).join(" v. ");

/** Every record as a FindItem, in group order. Build it once per change to the stores. */
export function findIndex(s: FindSources): FindItem[] {
  const byId = new Map(s.cases.map((c) => [c.id, c]));
  return [
    ...s.cases.map((c) =>
      item(
        {
          id: "case-" + c.id,
          kind: "case",
          title: c.caseNumber,
          detail: [parties(c), c.status].filter(Boolean).join(" · "),
          href: "#cases/" + c.id,
        },
        c.court,
        c.notes,
        c.nextEvent,
      ),
    ),
    ...s.contacts.map((c) =>
      item(
        {
          id: "contact-" + c.id,
          kind: "contact",
          title: c.name,
          detail: [CONTACT_TYPE_LABELS[c.type], c.organisation].filter(Boolean).join(" · "),
          href: "#clients/rolodex",
        },
        c.phone,
        c.address,
        c.notes,
      ),
    ),
    ...s.filings.map((f) =>
      item({
        id: "filing-" + f.id,
        kind: "filing",
        title: f.formTitle,
        detail: [f.caseNumber, f.charName, new Date(f.at).toLocaleDateString()].filter(Boolean).join(" · "),
        href: f.caseId && byId.has(f.caseId) ? "#cases/" + f.caseId : "#filings/" + f.formId,
      }),
    ),
    ...s.cases.flatMap((c) =>
      c.exhibits.map((e, i) =>
        item(
          {
            id: "exhibit-" + e.id,
            kind: "exhibit",
            title: "Exhibit " + exhibitLetter(i) + ": " + e.title,
            detail: c.caseNumber,
            href: "#cases/" + c.id,
          },
          e.description,
        ),
      ),
    ),
    ...s.invoices.map((inv) =>
      item({
        id: "invoice-" + inv.id,
        kind: "invoice",
        title: inv.number,
        detail: [inv.caseNumber, formatDay(inv.date), invoiceStatus(inv)].join(" · "),
        href: "#ledger",
      }),
    ),
    ...s.time.map((t) =>
      item(
        {
          id: "time-" + t.id,
          kind: "time",
          title: [s.nameOf(t.character), ACTIVITY_LABELS[t.activity], t.hours.toFixed(1) + " h"].join(" · "),
          detail: [byId.get(t.caseId)?.caseNumber, formatDay(t.date)].filter(Boolean).join(" · "),
          href: "#ledger",
        },
        t.note,
      ),
    ),
  ];
}

export interface FindGroup {
  kind: FindKind;
  items: FindItem[];
  /** How many matched, including any past MAX_PER_GROUP. */
  total: number;
}

/** The items with every word of `q` in them, grouped by kind (empty groups left out). */
export function find(index: readonly FindItem[], q: string): FindGroup[] {
  const terms = searchTerms(q).map((t) => [t, t.replace(/-/g, "")]);
  if (!terms.length) return [];
  const groups = new Map<FindKind, FindGroup>();
  for (const it of index) {
    if (!terms.every(([t, bare]) => it.text.includes(t) || (bare && it.text.includes(bare)))) continue;
    const g = groups.get(it.kind) ?? { kind: it.kind, items: [], total: 0 };
    g.total++;
    if (g.items.length < MAX_PER_GROUP) g.items.push(it);
    groups.set(it.kind, g);
  }
  return FIND_KINDS.flatMap((k) => (groups.has(k) ? [groups.get(k)!] : []));
}
