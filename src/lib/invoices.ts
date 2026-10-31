// The Ledger's invoices (LP-33): a case's logged time over a date range, frozen
// into numbered lines (FA-1990-0001) on a game date, with the payments received
// against it. One list under lawapp_invoices on the store base; it syncs
// (merged per invoice by `updated`, like time entries) and is in the full backup.
// The invoice sheet is one HTML render (invoiceHtml), so print, copy and .docx
// all show the same thing.

import { BRANDING } from "@/branding";
import { addDays, formatDay, gameToday } from "./deadlines";
import { ACTIVITY_LABELS, formatMoney, parseRate, type Activity, type TimeEntry } from "./ledger";
import type { Letterhead } from "./letterhead";
import type { SafeHtml } from "./safeHtml";
import { ISO_DATE_RE, ISO_TIME_RE, defaultKV, isId, newId, text, uniqueById, type KV } from "./storage";
import { createStore } from "./store";
import { compile, render } from "./template";

export const INVOICES_KEY = "lawapp_invoices";
export const INVOICES_VERSION = 1;
export const MAX_INVOICES = 2000;
const MAX_LINES = 1000;
const MAX_PAYMENTS = 200;
/** Largest payment, in dollars. */
export const MAX_PAYMENT = 10_000_000;

/** One logged entry as billed: who did what, and its amount at the rate then. */
export interface InvoiceLine {
  /** The time entry it came from. */
  entryId: string;
  /** Game date. */
  date: string;
  /** The character's name when billed. */
  who: string;
  activity: Activity;
  note?: string;
  hours: number;
  /** Dollars an hour. */
  rate: number;
  /** Dollars, to the cent. */
  amount: number;
}

export const PAYMENT_METHODS = ["cash", "cheque", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABELS: Record<PaymentMethod, string> = { cash: "Cash", cheque: "Cheque", bank: "Bank transfer" };

/** Game days from issue until an invoice is due (LP-93). */
export const INVOICE_TERMS_DAYS = 30;

export interface Payment {
  id: string;
  /** Game date. */
  date: string;
  /** Dollars, to the cent. */
  amount: number;
  /** How it was paid (LP-93); cash for payments from before methods. */
  method: PaymentMethod;
  note?: string;
}

export interface Invoice {
  id: string;
  /** "FA-1990-0001". */
  number: string;
  caseId: string;
  /** The case number when billed, so the invoice reads the same if the case goes. */
  caseNumber: string;
  /** The billed period, game dates, both inclusive; absent when open-ended. */
  from?: string;
  to?: string;
  /** Game date it was issued. */
  date: string;
  lines: InvoiceLine[];
  payments: Payment[];
  /** Real time, ISO: the newer copy wins a sync merge. */
  created: string;
  updated: string;
}

export type InvoiceStatus = "Unpaid" | "Part paid" | "Paid" | "Overdue";

const isDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE_RE.test(v);
const isActivity = (v: unknown): v is Activity => typeof v === "string" && v in ACTIVITY_LABELS;
const cents = (n: number) => Math.round(n * 100) / 100;
/** Sums dollars in whole cents, so 0.1 + 0.2 is 0.3. */
const sum = (ns: readonly number[]) => ns.reduce((t, n) => t + Math.round(n * 100), 0) / 100;

function cleanLine(raw: unknown): InvoiceLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rate = parseRate(o.rate);
  const hours = typeof o.hours === "number" && o.hours > 0 && o.hours <= 24 ? Math.round(o.hours * 10) / 10 : null;
  const who = text(o.who, 120);
  if (!isId(o.entryId) || !isDate(o.date) || !who || !hours || rate === null) return null;
  const note = text(o.note, 500);
  return {
    entryId: o.entryId,
    date: o.date,
    who,
    activity: isActivity(o.activity) ? o.activity : "research",
    ...(note ? { note } : {}),
    hours,
    rate,
    amount: cents(hours * rate),
  };
}

/** A payment as typed or synced; null without a game date or an amount from $0.01. */
export function cleanPayment(raw: unknown): Payment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const n = typeof o.amount === "number" ? o.amount : parseRate(o.amount);
  const amount = n === null || !Number.isFinite(n) ? null : cents(n);
  if (!isDate(o.date) || !amount || amount < 0.01 || amount > MAX_PAYMENT) return null;
  const note = text(o.note, 200);
  const method = (PAYMENT_METHODS as readonly unknown[]).includes(o.method) ? (o.method as PaymentMethod) : "cash";
  return { id: isId(o.id) ? o.id : newId(), date: o.date, amount, method, ...(note ? { note } : {}) };
}

/** Normalise an untrusted invoice (sync, backup); null without a number, case, date or a line. */
export function cleanInvoice(raw: unknown, now: string = new Date().toISOString()): Invoice | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const number = text(o.number, 40);
  const caseNumber = text(o.caseNumber, 60);
  const lines = Array.isArray(o.lines) ? o.lines.map(cleanLine).filter((l): l is InvoiceLine => !!l) : [];
  if (!number || !isId(o.caseId) || !caseNumber || !isDate(o.date) || !lines.length) return null;
  const created = typeof o.created === "string" && ISO_TIME_RE.test(o.created) ? o.created : now;
  return {
    id: isId(o.id) ? o.id : newId(),
    number,
    caseId: o.caseId,
    caseNumber,
    ...(isDate(o.from) ? { from: o.from } : {}),
    ...(isDate(o.to) ? { to: o.to } : {}),
    date: o.date,
    lines: lines.slice(0, MAX_LINES),
    payments: uniqueById(o.payments, cleanPayment).slice(0, MAX_PAYMENTS),
    created,
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : created,
  };
}

export const invoiceTotal = (inv: Pick<Invoice, "lines">) => sum(inv.lines.map((l) => l.amount));
export const invoicePaid = (inv: Pick<Invoice, "payments">) => sum(inv.payments.map((p) => p.amount));
export const invoiceBalance = (inv: Pick<Invoice, "lines" | "payments">) => sum([invoiceTotal(inv), -invoicePaid(inv)]);

/** The game date an invoice is due: INVOICE_TERMS_DAYS after it was issued. */
export const invoiceDue = (inv: Pick<Invoice, "date">) => addDays(inv.date, INVOICE_TERMS_DAYS);

/** Paid once paid in full; otherwise Overdue after its due date (game time), else Unpaid or Part paid. */
export function invoiceStatus(
  inv: Pick<Invoice, "date" | "lines" | "payments">,
  today: string = gameToday(),
): InvoiceStatus {
  const paid = invoicePaid(inv);
  if (paid >= invoiceTotal(inv)) return "Paid";
  if (today > invoiceDue(inv)) return "Overdue";
  return paid <= 0 ? "Unpaid" : "Part paid";
}

/** Accounts receivable: invoices with a balance still due, oldest first. */
export function receivables(list: readonly Invoice[]): Invoice[] {
  return list
    .filter((inv) => invoiceBalance(inv) > 0)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.number.localeCompare(b.number)));
}

/** The firm's letters for invoice numbers: "F&A" → "FA". */
export const INVOICE_PREFIX = BRANDING.shortName.replace(/[^A-Za-z]/g, "").toUpperCase() || "INV";

/** The next number for the game year of `date`: one past the highest that year ("FA-1990-0007"). */
export function nextInvoiceNumber(
  list: readonly Pick<Invoice, "number">[],
  date: string,
  prefix = INVOICE_PREFIX,
): string {
  const head = prefix + "-" + date.slice(0, 4) + "-";
  const last = list.reduce((n, inv) => {
    const m = inv.number.startsWith(head) ? /^\d+$/.exec(inv.number.slice(head.length)) : null;
    return m ? Math.max(n, Number(m[0])) : n;
  }, 0);
  return head + String(last + 1).padStart(4, "0");
}

export interface InvoiceDraft {
  caseId: string;
  caseNumber: string;
  from?: string;
  to?: string;
  /** Game date to issue it on. */
  date: string;
  /** The case's entries in the period. */
  entries: readonly TimeEntry[];
  /** An entry's rate (the case's, else the character's); null when it has none. */
  rateOf(e: TimeEntry): number | null;
  nameOf(characterId: string): string;
}

/** The lines for a draft, oldest first. Throws when there's nothing to bill or an entry has no rate. */
export function invoiceLines(d: InvoiceDraft): InvoiceLine[] {
  if (!d.entries.length) throw new Error("There's no logged time on this case in that period.");
  const unpriced = d.entries.filter((e) => d.rateOf(e) === null).length;
  if (unpriced) {
    throw new Error(
      unpriced +
        (unpriced === 1 ? " entry has" : " entries have") +
        " no rate. Set the case's rate, or each character's in the Characters dialog.",
    );
  }
  return [...d.entries]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created < b.created ? -1 : 1))
    .flatMap((e) => cleanLine({ ...e, entryId: e.id, who: d.nameOf(e.character), rate: d.rateOf(e) }) ?? []);
}

const SHEET = compile(
  "{{Letterhead@letterhead|}}" +
    "<p><strong>INVOICE {{Number}}</strong><br />Date: {{Date}}<br />Due: {{Due}}<br />Case: {{Case}}" +
    "{{?Period}}<br />Period: {{Period}}{{/Period}}</p>\n" +
    '<table border="1" cellpadding="4">\n' +
    "<tr><th>Date</th><th>Work</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>\n" +
    "{{#Lines}}<tr><td>{{Day}}</td><td>{{Work}}</td><td>{{Hours}}</td><td>{{Rate}}</td><td>{{Amount}}</td></tr>\n{{/Lines}}" +
    '<tr><td colspan="4">Subtotal</td><td>{{Subtotal}}</td></tr>\n' +
    '<tr><td colspan="4">Payments received</td><td>{{Paid}}</td></tr>\n' +
    '<tr><td colspan="4"><strong>Balance due</strong></td><td><strong>{{Balance}}</strong></td></tr>\n' +
    "</table>\n" +
    "<p>Status: {{Status}}</p>",
);

/** "Thu 1 Oct 1990 to Sat 31 Oct 1990", "from …", "to …", or "" when open-ended. */
export function periodText(from?: string, to?: string): string {
  if (from && to) return formatDay(from) + " to " + formatDay(to);
  return from ? "from " + formatDay(from) : to ? "to " + formatDay(to) : "";
}

/** The invoice sheet, through the template engine (every value escaped), with the letterhead when given. */
export function invoiceHtml(inv: Invoice, letterhead?: Letterhead, today: string = gameToday()): SafeHtml {
  const period = periodText(inv.from, inv.to);
  return render(
    SHEET,
    {
      Number: inv.number,
      Date: formatDay(inv.date),
      Due: formatDay(invoiceDue(inv)),
      Case: inv.caseNumber,
      "?Period": !!period,
      Period: period,
      "#Lines": inv.lines.map((l) => ({
        Day: formatDay(l.date),
        Work: [l.who, ACTIVITY_LABELS[l.activity], l.note].filter(Boolean).join(": "),
        Hours: l.hours.toFixed(1),
        Rate: formatMoney(l.rate) + "/h",
        Amount: formatMoney(l.amount),
      })),
      Subtotal: formatMoney(invoiceTotal(inv)),
      Paid: formatMoney(invoicePaid(inv)),
      Balance: formatMoney(invoiceBalance(inv)),
      Status: invoiceStatus(inv, today),
    },
    letterhead ? { letterhead } : {},
  );
}

/** Newest issued first, then highest number. */
function order(list: Invoice[]): Invoice[] {
  return [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.number.localeCompare(a.number)));
}

function validList(raw: unknown): Invoice[] {
  return order(uniqueById(raw, cleanInvoice)).slice(0, MAX_INVOICES);
}

export interface InvoiceStore {
  /** Newest first. */
  list(): Invoice[];
  get(id: string): Invoice | null;
  /** Number and save a new invoice from a draft; throws when it can't be billed. */
  create(d: InvoiceDraft): Invoice;
  /** Record a payment; throws when it isn't one. */
  addPayment(invoiceId: string, payment: Omit<Payment, "id" | "method"> & { method?: PaymentMethod }): void;
  removePayment(invoiceId: string, paymentId: string): void;
  remove(id: string): void;
  /** Replace every invoice (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createInvoiceStore(kv: KV): InvoiceStore {
  const store = createStore<Invoice[]>(kv, {
    key: INVOICES_KEY,
    version: INVOICES_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  const put = (inv: Invoice) => store.set(order([...store.get().filter((x) => x.id !== inv.id), inv]));
  const edit = (id: string, fn: (inv: Invoice) => Invoice) => {
    const inv = store.get().find((x) => x.id === id);
    if (!inv) throw new Error("That invoice is no longer in the Ledger.");
    put({ ...fn(inv), updated: new Date().toISOString() });
  };
  return {
    list: () => store.get(),
    get: (id) => store.get().find((x) => x.id === id) || null,
    create(d) {
      const list = store.get();
      if (list.length >= MAX_INVOICES) throw new Error("The Ledger can hold up to " + MAX_INVOICES + " invoices.");
      const now = new Date().toISOString();
      const inv = cleanInvoice(
        { ...d, number: nextInvoiceNumber(list, d.date), lines: invoiceLines(d), created: now },
        now,
      );
      if (!inv) throw new Error("Pick a case and the date to issue it on.");
      put(inv);
      return inv;
    },
    addPayment(invoiceId, payment) {
      const p = cleanPayment(payment);
      if (!p) throw new Error("Give the date and an amount in dollars, e.g. 250.");
      edit(invoiceId, (inv) => {
        if (inv.payments.length >= MAX_PAYMENTS)
          throw new Error("An invoice can hold up to " + MAX_PAYMENTS + " payments.");
        return { ...inv, payments: [...inv.payments, p] };
      });
    },
    removePayment(invoiceId, paymentId) {
      edit(invoiceId, (inv) => ({ ...inv, payments: inv.payments.filter((p) => p.id !== paymentId) }));
    },
    remove(id) {
      store.set(store.get().filter((x) => x.id !== id));
    },
    replaceAll(items) {
      store.set(validList(items));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: InvoiceStore | null = null;

/** The app's invoices (created on first use; client only). */
export function invoiceStore(): InvoiceStore {
  if (!instance) instance = createInvoiceStore(defaultKV());
  return instance;
}
