// A case's charges (LP-236): the list attached from the Law Library's charge calculator, with the same
// totals. Open in calculator puts the list back in the calculator (replacing what's there); Remove
// takes it off the case.

import { useState } from "react";
import { caseStore } from "@/lib/cases";
import { readChargeList, withCharges, writeChargeList } from "@/lib/chargeList";
import { chargeCitation } from "@/lib/penalCode";
import { SAVE_FAILED } from "@/lib/storage";
import type { Case } from "@/lib/types";
import ChargeTotals from "@/ui/ChargeTotals";

export default function CaseCharges({ c }: { c: Case }) {
  const [error, setError] = useState("");
  const list = c.charges || [];
  const lines = withCharges(list);

  if (!list.length) {
    return (
      <p className="small muted">
        No charges. Add them in the <a href="#library/penal-code">Law Library&apos;s charge calculator</a>, then use{" "}
        <strong>Attach to case</strong>.
      </p>
    );
  }

  const open = () => {
    if (readChargeList().length && !window.confirm("Replace the charges in the calculator with this case's?")) return;
    if (!writeChargeList(list)) return setError(SAVE_FAILED);
    location.hash = "#library/penal-code";
  };

  const remove = () => {
    if (!window.confirm("Remove the charges from " + c.caseNumber + "?")) return;
    try {
      caseStore().save({ ...c, charges: [] });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <ul className="case-charges" id="case-charges-list">
        {lines.map(({ section, count, charge }) => (
          <li key={section}>{count + " × " + chargeCitation(charge)}</li>
        ))}
      </ul>
      {lines.length < list.length && (
        <p className="small muted">
          {list.length - lines.length === 1
            ? "One charge is no longer in the penal code and isn't shown."
            : list.length - lines.length + " charges are no longer in the penal code and aren't shown."}
        </p>
      )}
      <ChargeTotals list={list} idPrefix="case-charges" />
      <div className="row">
        <button type="button" className="btn" id="case-charges-open" onClick={open}>
          Open in calculator
        </button>
        <button type="button" className="btn" id="case-charges-remove" onClick={remove}>
          Remove
        </button>
      </div>
      {error && <p className="small bad">{error}</p>}
    </>
  );
}
