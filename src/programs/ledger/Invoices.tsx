// The Ledger's invoices (LP-33): bill the filtered case's time as a numbered
// invoice, then record payments and print, copy or download it. The sheet is
// one render (invoiceHtml), shown here and used for every output.

import { useMemo, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { fromHtml } from "@/lib/bbcode";
import { copyRich, copyText } from "@/lib/clipboard";
import { gameToday, formatDay } from "@/lib/deadlines";
import { toDiscord } from "@/lib/discord";
import { docxRequestBody } from "@/lib/docx/request";
import { download } from "@/lib/download";
import {
  invoiceBalance,
  invoiceDue,
  invoiceHtml,
  invoiceStatus,
  invoiceStore,
  invoiceTotal,
  METHOD_LABELS,
  PAYMENT_METHODS,
  receivables,
  type Invoice,
  type PaymentMethod,
} from "@/lib/invoices";
import { filterEntries, formatMoney, type TimeEntry, type TimeFilter } from "@/lib/ledger";
import { letterheadStore } from "@/lib/letterhead";
import type { Case } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";
import { useInvoiceVersion } from "@/ui/useStore";

/** One invoice: the sheet, its payments, and print, copy and download. */
function InvoiceView({ inv, onClose }: { inv: Invoice; onClose(): void }) {
  const html = useMemo(() => invoiceHtml(inv, letterheadStore().get()), [inv]);
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [date, setDate] = useState(gameToday);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const say = (text: string, bad = false) => setStatus({ text, bad });

  // The id exists only while the print dialog is open, so printing shows just the invoice.
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  };

  const pay = (ev: FormEvent) => {
    ev.preventDefault();
    try {
      invoiceStore().addPayment(inv.id, { date, amount: Number(amount.replace(/[$,\s]/g, "")), method, note });
      setAmount("");
      setNote("");
      say("Payment recorded.");
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    }
  };

  const docx = async () => {
    try {
      const res = await fetch("/api/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: docxRequestBody(html, "Invoice " + inv.number, ""),
      });
      if (!res.ok) return say("Couldn't build the .docx (" + res.status + ").", true);
      download(await res.blob(), "invoice-" + inv.number + ".docx");
    } catch {
      say("Couldn't build the .docx (server unreachable).", true);
    }
  };

  const remove = () => {
    if (confirm("Delete invoice " + inv.number + "? Its payments go with it.")) {
      invoiceStore().remove(inv.id);
      onClose();
    }
  };

  return (
    <div className="invoice" id="invoice">
      <div className="row invoice-actions">
        <button type="button" className="btn" id="invoice-print" onClick={print}>
          Print
        </button>
        <button
          type="button"
          className="btn"
          id="invoice-copy"
          onClick={async () => {
            const ok = await copyRich(html, fromHtml(html));
            say(ok ? "Copied. Paste it into the forum editor." : "Copy failed.", !ok);
          }}
        >
          Copy for forum
        </button>
        <button
          type="button"
          className="btn"
          id="invoice-discord"
          onClick={async () => {
            const ok = await copyText(toDiscord(html));
            say(ok ? "Copied for Discord." : "Copy failed.", !ok);
          }}
        >
          Copy for Discord
        </button>
        <button type="button" className="btn" id="invoice-docx" onClick={() => void docx()}>
          Download .docx
        </button>
        <button type="button" className="btn danger-quiet" id="invoice-delete" onClick={remove}>
          Delete
        </button>
        <button type="button" className="btn" id="invoice-close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status" id="invoice-status">
        {status?.text || ""}
      </p>
      <div
        className="invoice-sheet"
        id={printing ? "invoice-print-sheet" : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <h4>Payments</h4>
      {inv.payments.length > 0 && (
        <ul className="invoice-payments" id="invoice-payments">
          {inv.payments.map((p) => (
            <li key={p.id}>
              {formatDay(p.date) +
                ": " +
                formatMoney(p.amount) +
                ", " +
                METHOD_LABELS[p.method] +
                (p.note ? " (" + p.note + ")" : "")}{" "}
              <button
                type="button"
                className="mini danger-quiet"
                onClick={() => invoiceStore().removePayment(inv.id, p.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row invoice-pay" id="payment-form" noValidate onSubmit={pay}>
        <GameDateInput id="payment-date" aria-label="Payment date" value={date} onChange={setDate} />
        <input
          id="payment-amount"
          inputMode="decimal"
          aria-label="Amount ($)"
          placeholder="Amount ($)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          id="payment-method"
          aria-label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
        <input
          id="payment-note"
          aria-label="Note"
          placeholder="Note, e.g. cheque number"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn" id="payment-add">
          Record payment
        </button>
      </form>
    </div>
  );
}

/** The invoices (the filtered case's, when there is one), and New invoice for that case's filtered time. */
export default function Invoices({
  cases,
  entries,
  filter,
  rateOf,
  nameOf,
}: {
  cases: readonly Case[];
  entries: readonly TimeEntry[];
  filter: TimeFilter;
  rateOf(e: TimeEntry): number | null;
  nameOf(id: string): string;
}) {
  const version = useInvoiceVersion();
  const all = useMemo(() => (version >= 0 ? invoiceStore().list() : []), [version]);
  const shown = filter.caseId ? all.filter((i) => i.caseId === filter.caseId) : all;
  const owed = receivables(shown);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? all.find((i) => i.id === openId) : undefined;
  const [error, setError] = useState("");
  const c = filter.caseId ? cases.find((x) => x.id === filter.caseId) : undefined;

  const create = () => {
    if (!c) return;
    try {
      const inv = invoiceStore().create({
        caseId: c.id,
        caseNumber: c.caseNumber,
        from: filter.from,
        to: filter.to,
        date: gameToday(),
        entries: filterEntries(entries, { caseId: c.id, from: filter.from, to: filter.to }),
        rateOf,
        nameOf,
      });
      setError("");
      setOpenId(inv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="invoices" id="invoices" aria-labelledby="invoices-title">
      <div className="row ledger-head">
        <h3 id="invoices-title">Invoices</h3>
        {c ? (
          <button type="button" className="btn" id="invoice-new" onClick={create}>
            {"Invoice " + c.caseNumber + (filter.from || filter.to ? " for these dates" : "")}
          </button>
        ) : (
          <p className="small muted">Pick a case above (and dates, if you like) to invoice its time.</p>
        )}
      </div>
      <p className="error" role="alert" id="invoice-error">
        {error}
      </p>
      {open && <InvoiceView key={open.id} inv={open} onClose={() => setOpenId(null)} />}
      {owed.length > 0 && (
        <>
          <h4 id="receivables-title">Accounts receivable</h4>
          <p className="small" id="receivables-total">
            {formatMoney(owed.reduce((n, inv) => n + Math.round(invoiceBalance(inv) * 100), 0) / 100) +
              " owed on " +
              owed.length +
              (owed.length === 1 ? " invoice" : " invoices") +
              ", oldest first."}
          </p>
          <div className="ledger-scroll">
            <table className="ledger-table" id="receivables" aria-labelledby="receivables-title">
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Case</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="num">
                    Balance
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {owed.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <button type="button" className="mini" onClick={() => setOpenId(inv.id)}>
                        {inv.number}
                      </button>
                    </td>
                    <td>{inv.caseNumber}</td>
                    <td>{formatDay(invoiceDue(inv))}</td>
                    <td className="num">{formatMoney(invoiceBalance(inv))}</td>
                    <td>{invoiceStatus(inv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>All invoices</h4>
        </>
      )}
      {shown.length > 0 && (
        <div className="ledger-scroll">
          <table className="ledger-table" id="invoice-list">
            <thead>
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Case</th>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col" className="num">
                  Balance
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.number}</td>
                  <td>{inv.caseNumber}</td>
                  <td>{formatDay(inv.date)}</td>
                  <td className="num">{formatMoney(invoiceTotal(inv))}</td>
                  <td className="num">{formatMoney(invoiceBalance(inv))}</td>
                  <td>{invoiceStatus(inv)}</td>
                  <td className="ledger-actions">
                    <button type="button" className="mini" onClick={() => setOpenId(inv.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
