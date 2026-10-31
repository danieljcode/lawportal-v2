// Client retainers (LP-93): money a client (a Rolodex contact) deposits up front,
// drawn down by invoice payments made "From retainer". Deposits are one list
// under lawapp_retainers on the store base; they sync per deposit by `updated`,
// like invoices, and are in the full backup. The draws live on the invoices, so
// a client's balance and history are worked out from both.

import { formatDay } from "./deadlines";
import { cleanPayment, METHOD_LABELS, type Invoice, type PaymentMethod } from "./invoices";
import { formatMoney } from "./ledger";
import type { Letterhead } from "./letterhead";
import type { SafeHtml } from "./safeHtml";
import { ISO_TIME_RE, defaultKV, isId, uniqueById, type KV } from "./storage";
import { createStore } from "./store";
import { compile, render } from "./template";

export const RETAINERS_KEY = "lawapp_retainers";
export const RETAINERS_VERSION = 1;
export const MAX_DEPOSITS = 5000;

export interface Deposit {
  id: string;
  /** The client's Rolodex contact. */
  contactId: string;
  /** Game date. */
  date: string;
  /** Dollars, to the cent. */
  amount: number;
  /** Cash, cheque or bank transfer (never "retainer"). */
  method: Exclude<PaymentMethod, "retainer">;
  note?: string;
  created: string;
  updated: string;
}

/** Normalise an untrusted deposit; null without a client, a game date or an amount. */
export function cleanDeposit(raw: unknown, now: string = new Date().toISOString()): Deposit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const p = cleanPayment({ ...o, method: o.method === "retainer" ? "cash" : o.method });
  if (!p || !isId(o.contactId)) return null;
  const created = typeof o.created === "string" && ISO_TIME_RE.test(o.created) ? o.created : now;
  return {
    id: p.id,
    contactId: o.contactId,
    date: p.date,
    amount: p.amount,
    method: p.method as Deposit["method"],
    ...(p.note ? { note: p.note } : {}),
    created,
    updated: typeof o.updated === "string" && ISO_TIME_RE.test(o.updated) ? o.updated : created,
  };
}

/** One line of a client's retainer history. */
export interface RetainerRow {
  /** Game date. */
  date: string;
  /** "Deposit (Cheque)", "Invoice FA-1990-0001". */
  what: string;
  /** Dollars in (deposit) or out (draw, negative). */
  amount: number;
  /** The balance after it. */
  balance: number;
  /** The deposit's id, so it can be removed; absent for a draw. */
  depositId?: string;
}

/** A client's deposits and draws, oldest first, with the running balance. */
export function retainerHistory(
  contactId: string,
  deposits: readonly Deposit[],
  invoices: readonly Invoice[],
): RetainerRow[] {
  const rows = [
    ...deposits
      .filter((d) => d.contactId === contactId)
      .map((d) => ({
        date: d.date,
        what: "Deposit (" + METHOD_LABELS[d.method] + ")" + (d.note ? ": " + d.note : ""),
        cents: Math.round(d.amount * 100),
        depositId: d.id,
      })),
    ...invoices.flatMap((inv) =>
      inv.payments
        .filter((p) => p.method === "retainer" && p.contactId === contactId)
        .map((p) => ({
          date: p.date,
          what: "Invoice " + inv.number,
          cents: -Math.round(p.amount * 100),
          depositId: undefined,
        })),
    ),
  ].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : b.cents - a.cents));
  let balance = 0;
  return rows.map((r) => {
    balance += r.cents;
    return {
      date: r.date,
      what: r.what,
      amount: r.cents / 100,
      balance: balance / 100,
      ...(r.depositId ? { depositId: r.depositId } : {}),
    };
  });
}

/** What's left of a client's retainer. */
export function retainerBalance(contactId: string, deposits: readonly Deposit[], invoices: readonly Invoice[]): number {
  const rows = retainerHistory(contactId, deposits, invoices);
  return rows.length ? rows[rows.length - 1].balance : 0;
}

const LETTER = compile(
  "{{Letterhead@letterhead|}}" +
    "<p>{{Date}}</p>\n" +
    "<p>Dear {{Client}},</p>\n" +
    "<p>Your retainer with {{Firm}} now stands at <strong>{{Balance}}</strong>, below the {{Floor}} we keep " +
    "on account for your matters.</p>\n" +
    "<p>Please deposit at least <strong>{{TopUp}}</strong> so that we can continue to act for you without " +
    "interruption.</p>\n" +
    "<p>Yours sincerely,</p>\n" +
    "<p>{{Firm}}</p>",
);

/** The request top-up letter: the balance, the minimum, and at least the difference asked for. */
export function topUpLetterHtml(
  o: { client: string; balance: number; floor: number; date: string },
  letterhead: Letterhead,
): SafeHtml {
  return render(
    LETTER,
    {
      Date: formatDay(o.date),
      Client: o.client,
      Firm: letterhead.firmName,
      Balance: formatMoney(o.balance),
      Floor: formatMoney(o.floor),
      TopUp: formatMoney(Math.max(0, Math.round((o.floor - o.balance) * 100) / 100)),
    },
    { letterhead },
  );
}

function validList(raw: unknown): Deposit[] {
  return uniqueById(raw, cleanDeposit).slice(0, MAX_DEPOSITS);
}

export interface RetainerStore {
  list(): Deposit[];
  /** Record a deposit; throws when it isn't one. */
  deposit(input: Pick<Deposit, "contactId" | "date" | "amount" | "method"> & { note?: string }): Deposit;
  remove(id: string): void;
  /** Replace every deposit (sync). */
  replaceAll(items: unknown): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createRetainerStore(kv: KV): RetainerStore {
  const store = createStore<Deposit[]>(kv, {
    key: RETAINERS_KEY,
    version: RETAINERS_VERSION,
    validate: validList,
    isEmpty: (l) => l.length === 0,
  });
  return {
    list: () => store.get(),
    deposit(input) {
      const list = store.get();
      if (list.length >= MAX_DEPOSITS) throw new Error("The Ledger can hold up to " + MAX_DEPOSITS + " deposits.");
      const d = cleanDeposit({ ...input, id: undefined, created: undefined });
      if (!d) throw new Error("Give the date and an amount in dollars, e.g. 500.");
      store.set([...list, d]);
      return d;
    },
    remove(id) {
      store.set(store.get().filter((d) => d.id !== id));
    },
    replaceAll(items) {
      store.set(validList(items));
    },
    subscribe: store.subscribe,
    version: store.version,
  };
}

let instance: RetainerStore | null = null;

/** The app's retainer deposits (created on first use; client only). */
export function retainerStore(): RetainerStore {
  if (!instance) instance = createRetainerStore(defaultKV());
  return instance;
}
