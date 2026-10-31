// Client retainers (LP-93): each Rolodex client's deposits in and invoice payments
// drawn out, with the running balance; a warning below the client's floor, and
// a request top-up letter (Sheet).

import { useMemo, useState, type FormEvent } from "react";
import { contactStore, type Contact } from "@/lib/contacts";
import { formatDay, gameToday } from "@/lib/deadlines";
import { invoiceStore, METHOD_LABELS, type Invoice } from "@/lib/invoices";
import { formatMoney, parseRate } from "@/lib/ledger";
import { letterheadStore } from "@/lib/letterhead";
import { retainerBalance, retainerHistory, retainerStore, topUpLetterHtml, type Deposit } from "@/lib/retainers";
import GameDateInput from "@/ui/GameDateInput";
import { useContactVersion, useInvoiceVersion, useRetainerVersion } from "@/ui/useStore";
import Sheet from "./Sheet";

const DEPOSIT_METHODS = ["cash", "cheque", "bank"] as const;

/** One client: their floor, a deposit form, the history, and the top-up letter when low. */
function ClientRetainer({
  client,
  deposits,
  invoices,
  onClose,
}: {
  client: Contact;
  deposits: readonly Deposit[];
  invoices: readonly Invoice[];
  onClose(): void;
}) {
  const history = retainerHistory(client.id, deposits, invoices);
  const balance = history.length ? history[history.length - 1].balance : 0;
  const low = client.retainerFloor !== undefined && balance < client.retainerFloor;
  const [floor, setFloor] = useState(client.retainerFloor ? String(client.retainerFloor) : "");
  const [date, setDate] = useState(gameToday);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Deposit["method"]>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [letter, setLetter] = useState(false);

  const saveFloor = (ev: FormEvent) => {
    ev.preventDefault();
    const n = parseRate(floor);
    if (floor.trim() && n === null) return setError("Give the floor in dollars, e.g. 500.");
    setError("");
    contactStore().save({ ...client, retainerFloor: n ?? undefined });
  };

  const deposit = (ev: FormEvent) => {
    ev.preventDefault();
    try {
      retainerStore().deposit({ contactId: client.id, date, amount: parseRate(amount) ?? 0, method, note });
      setAmount("");
      setNote("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="invoice" id="retainer">
      <div className="row ledger-head">
        <h4 id="retainer-title">{client.name + ": " + formatMoney(balance)}</h4>
        <button type="button" className="btn" id="retainer-close" onClick={onClose}>
          Close
        </button>
      </div>
      {low && (
        <p className="small bad" id="retainer-low">
          {"Below the " + formatMoney(client.retainerFloor!) + " floor. "}
          <button type="button" className="mini" id="topup-open" onClick={() => setLetter(true)}>
            Request top-up
          </button>
        </p>
      )}
      {low && letter && (
        <Sheet
          html={topUpLetterHtml(
            { client: client.name, balance, floor: client.retainerFloor!, date: gameToday() },
            letterheadStore().get(),
          )}
          title={"Retainer top-up: " + client.name}
          filename="retainer-top-up"
          prefix="topup"
        >
          <button type="button" className="btn" onClick={() => setLetter(false)}>
            Close letter
          </button>
        </Sheet>
      )}
      <form className="row ledger-rate" id="floor-form" noValidate onSubmit={saveFloor}>
        <label htmlFor="retainer-floor">Warn below ($)</label>
        <input
          id="retainer-floor"
          inputMode="decimal"
          placeholder="No warning"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
        />
        <button type="submit" className="btn" id="floor-save">
          Set
        </button>
      </form>
      <form className="row invoice-pay" id="deposit-form" noValidate onSubmit={deposit}>
        <GameDateInput id="deposit-date" aria-label="Deposit date" value={date} onChange={setDate} />
        <input
          id="deposit-amount"
          inputMode="decimal"
          aria-label="Amount ($)"
          placeholder="Amount ($)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          id="deposit-method"
          aria-label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as Deposit["method"])}
        >
          {DEPOSIT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
        <input
          id="deposit-note"
          aria-label="Note"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn" id="deposit-add">
          Record deposit
        </button>
      </form>
      <p className="error" role="alert" id="retainer-error">
        {error}
      </p>
      {history.length > 0 && (
        <div className="ledger-scroll">
          <table className="ledger-table" id="retainer-history">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">What</th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col" className="num">
                  Balance
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={r.depositId || i}>
                  <td>{formatDay(r.date)}</td>
                  <td>{r.what}</td>
                  <td className="num">{(r.amount < 0 ? "−" : "") + formatMoney(Math.abs(r.amount))}</td>
                  <td className="num">{formatMoney(r.balance)}</td>
                  <td className="ledger-actions">
                    {r.depositId && (
                      <button
                        type="button"
                        className="mini danger-quiet"
                        onClick={() => confirm("Remove this deposit?") && retainerStore().remove(r.depositId!)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Every Rolodex client with their retainer balance; open one to manage it. */
export default function Retainers() {
  const contactVersion = useContactVersion();
  const clients = useMemo(
    () =>
      contactVersion >= 0
        ? contactStore()
            .list()
            .filter((c) => c.type === "client")
        : [],
    [contactVersion],
  );
  const depositVersion = useRetainerVersion();
  const deposits = useMemo(() => (depositVersion >= 0 ? retainerStore().list() : []), [depositVersion]);
  const invoiceVersion = useInvoiceVersion();
  const invoices = useMemo(() => (invoiceVersion >= 0 ? invoiceStore().list() : []), [invoiceVersion]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? clients.find((c) => c.id === openId) : undefined;

  return (
    <section className="invoices" id="retainers" aria-labelledby="retainers-title">
      <h3 id="retainers-title">Retainers</h3>
      {!clients.length ? (
        <p className="small muted" id="retainers-empty">
          Retainers are kept for clients in the <a href="#clients/rolodex">Rolodex</a>. Add one with the type Client.
        </p>
      ) : (
        <>
          {open && (
            <ClientRetainer
              key={open.id}
              client={open}
              deposits={deposits}
              invoices={invoices}
              onClose={() => setOpenId(null)}
            />
          )}
          <div className="ledger-scroll">
            <table className="ledger-table" id="retainer-list">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col" className="num">
                    Balance
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const balance = retainerBalance(c.id, deposits, invoices);
                  const low = c.retainerFloor !== undefined && balance < c.retainerFloor;
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.name}
                        {low && <span className="tag req">Low</span>}
                      </td>
                      <td className="num">{formatMoney(balance)}</td>
                      <td className="ledger-actions">
                        <button type="button" className="mini" onClick={() => setOpenId(c.id)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
