// The charge calculator on the Law Library's Penal Code page (LP-218): the charges added from the
// search below, each with a count, and their total time and fine. Copy gives a plain-text summary.

import { useState } from "react";
import {
  chargeListText,
  chargeTotals,
  discretionText,
  MAX_COUNT,
  setCount,
  timeText,
  totalFineText,
  withCharges,
  type ChargeLine,
} from "@/lib/chargeList";
import { copyText } from "@/lib/clipboard";
import { chargeCitation, fineText, PENAL_CODE, sentenceText, type PenalCode } from "@/lib/penalCode";

export default function ChargeCalculator({
  list,
  onChange,
  code = PENAL_CODE,
}: {
  list: ChargeLine[];
  onChange(list: ChargeLine[]): void;
  code?: PenalCode;
}) {
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const lines = withCharges(list, code);
  const t = chargeTotals(list, code);
  const time = timeText(t);

  const copy = async () => {
    const ok = await copyText(chargeListText(list, code));
    setStatus(
      ok ? { text: "Copied the charges and totals.", bad: false } : { text: "Copy failed: try again.", bad: true },
    );
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
          <dl className="charge-calc-totals" id="charge-calc-totals">
            {time && (
              <>
                <dt>Time</dt>
                <dd id="charge-calc-time">{time}</dd>
              </>
            )}
            <dt>Fine</dt>
            <dd id="charge-calc-fine">{totalFineText(t)}</dd>
            {t.discretion.length > 0 && (
              <>
                <dt>Judge&apos;s discretion</dt>
                <dd id="charge-calc-discretion">{t.discretion.map(discretionText).join(", ")}</dd>
              </>
            )}
          </dl>
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
        </>
      ) : (
        <p className="small muted" id="charge-calc-empty">
          Add charges from the list below to total their time and fine.
        </p>
      )}
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status">
        {status?.text || ""}
      </p>
    </section>
  );
}
