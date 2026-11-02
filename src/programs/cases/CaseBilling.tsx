// A case's billing summary (LP-173): the Ledger's own sums for this case, and links into the Ledger
// scoped to it. It records nothing itself.

import { useMemo } from "react";
import { caseBilling, invoiceStore } from "@/lib/invoices";
import { formatMoney, hoursText, rateLookup, timeStore } from "@/lib/ledger";
import type { Case, Character } from "@/lib/types";
import { useInvoiceVersion, useTimeVersion } from "@/ui/useStore";

export default function CaseBilling({ c, characters }: { c: Case; characters: Character[] }) {
  const timeVersion = useTimeVersion();
  const invoiceVersion = useInvoiceVersion();
  const b = useMemo(
    () =>
      caseBilling(
        c.id,
        timeVersion >= 0 ? timeStore().list() : [],
        invoiceVersion >= 0 ? invoiceStore().list() : [],
        rateLookup([c], characters),
      ),
    [c, characters, timeVersion, invoiceVersion],
  );
  const ledger = "#ledger/case/" + c.id;
  const links = (
    <div className="row case-billing-links">
      <a className="btn" id="case-billing-log" href={ledger + "/log"}>
        Log time
      </a>
      <a className="btn" id="case-billing-invoices" href={ledger + "/invoices"}>
        Invoices
      </a>
      <a className="btn" id="case-billing-ledger" href={ledger}>
        Open in Ledger
      </a>
    </div>
  );

  if (!b.loggedHours && !b.invoiceCount) {
    return (
      <>
        <p className="small muted" id="case-billing-empty">
          No time or invoices yet. Log time on this case, then invoice it from the Ledger.
        </p>
        {links}
      </>
    );
  }
  return (
    <>
      <dl className="case-billing small" id="case-billing-summary">
        <dt>Logged</dt>
        <dd id="case-billing-logged">{b.loggedHours ? hoursText(b.loggedHours) : "No time logged yet"}</dd>
        <dt>Not invoiced</dt>
        <dd id="case-billing-unbilled">
          {b.unbilledHours
            ? hoursText(b.unbilledHours) +
              (b.unbilledValue ? ", worth " + formatMoney(b.unbilledValue) : "") +
              (b.unpriced ? " (" + b.unpriced + (b.unpriced === 1 ? " entry" : " entries") + " with no rate)" : "")
            : "Nothing"}
        </dd>
        <dt>Invoiced</dt>
        <dd id="case-billing-invoiced">
          {b.invoiceCount
            ? formatMoney(b.invoiced) + " on " + b.invoiceCount + (b.invoiceCount === 1 ? " invoice" : " invoices")
            : "No invoices yet"}
        </dd>
        {b.invoiceCount > 0 && (
          <>
            <dt>Paid</dt>
            <dd id="case-billing-paid">{formatMoney(b.paid)}</dd>
            <dt>Outstanding</dt>
            <dd id="case-billing-outstanding">
              <strong>{formatMoney(b.outstanding)}</strong>
            </dd>
          </>
        )}
      </dl>
      <p className="small muted">
        A client&apos;s retainer isn&apos;t counted here, except what has paid an invoice on this case.
      </p>
      {links}
    </>
  );
}
