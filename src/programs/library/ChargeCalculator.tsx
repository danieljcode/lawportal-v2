// The charge calculator on the Law Library's Penal Code page (LP-218): the charges added from the
// search below, each with a count, and their total time and fine. Copy gives a plain-text summary;
// Attach to case saves the list on a firm case (LP-236), replacing any list it had.

import { useMemo, useState } from "react";
import { caseParties, caseStore, filterCases } from "@/lib/cases";
import { chargeListText, MAX_COUNT, setCount, withCharges, type ChargeLine } from "@/lib/chargeList";
import { copyText } from "@/lib/clipboard";
import { chargeCitation, fineText, PENAL_CODE, sentenceText, type PenalCode } from "@/lib/penalCode";
import ChargeTotals from "@/ui/ChargeTotals";
import { useCaseVersion } from "@/ui/useStore";

export default function ChargeCalculator({
  list,
  onChange,
  code = PENAL_CODE,
}: {
  list: ChargeLine[];
  onChange(list: ChargeLine[]): void;
  code?: PenalCode;
}) {
  const [status, setStatus] = useState<{ text: string; bad: boolean; caseId?: string } | null>(null);
  const [caseId, setCaseId] = useState("");
  const version = useCaseVersion();
  const cases = useMemo(() => (version >= 0 ? filterCases(caseStore().list(), {}) : []), [version]);
  const lines = withCharges(list, code);

  const copy = async () => {
    const ok = await copyText(chargeListText(list, code));
    setStatus(
      ok ? { text: "Copied the charges and totals.", bad: false } : { text: "Copy failed: try again.", bad: true },
    );
  };

  const attach = () => {
    const c = caseStore().get(caseId);
    if (!c) return setStatus({ text: "Pick a case.", bad: true });
    if (c.charges?.length && !window.confirm("Replace the charges already on " + c.caseNumber + "?")) return;
    try {
      caseStore().save({ ...c, charges: list });
      setStatus({ text: "Attached to " + c.caseNumber + ".", bad: false, caseId: c.id });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), bad: true });
    }
  };

  return (
    <section className="charge-calc" id="charge-calc" aria-labelledby="charge-calc-title">
      <h3 id="charge-calc-title">Charge calculator</h3>
      {lines.length ? (
        <>
          <ul className="charge-calc-list" id="charge-calc-list">
            {lines.map(({ section, count, charge }) => {
              const name = chargeCitation(charge);
              const fine = fineText(charge);
              return (
                <li key={section}>
                  <span className="charge-calc-count">
                    <button
                      type="button"
                      className="mini"
                      aria-label={"One fewer " + name}
                      disabled={count <= 1}
                      onClick={() => onChange(setCount(list, section, count - 1))}
                    >
                      −
                    </button>
                    <span aria-label={"Count of " + name}>{count + " ×"}</span>
                    <button
                      type="button"
                      className="mini"
                      aria-label={"One more " + name}
                      disabled={count >= MAX_COUNT}
                      onClick={() => onChange(setCount(list, section, count + 1))}
                    >
                      +
                    </button>
                  </span>
                  <span className="charge-calc-name">
                    <strong>{name}</strong>
                    <span className="small muted">{" " + sentenceText(charge) + (fine ? " · Fine " + fine : "")}</span>
                  </span>
                  <button
                    type="button"
                    className="mini"
                    aria-label={"Remove " + name}
                    onClick={() => onChange(list.filter((l) => l.section !== section))}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <ChargeTotals list={list} idPrefix="charge-calc" code={code} />
          <div className="row">
            <button type="button" className="btn primary" id="charge-calc-copy" onClick={() => void copy()}>
              Copy
            </button>
            <button
              type="button"
              className="btn"
              id="charge-calc-clear"
              onClick={() => {
                onChange([]);
                setStatus(null);
              }}
            >
              Clear
            </button>
          </div>
          {cases.length > 0 && (
            <div className="row">
              <select
                id="charge-calc-case"
                aria-label="Case to attach the charges to"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              >
                <option value="">Pick a case…</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber + (caseParties(c) ? " · " + caseParties(c) : "")}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" id="charge-calc-attach" onClick={attach}>
                Attach to case
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="small muted" id="charge-calc-empty">
          Add charges from the list below to total their time and fine.
        </p>
      )}
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status">
        {status?.text || ""}
        {status?.caseId && (
          <>
            {" "}
            <a href={"#cases/" + status.caseId} id="charge-calc-open-case">
              Open the case
            </a>
          </>
        )}
      </p>
    </section>
  );
}
