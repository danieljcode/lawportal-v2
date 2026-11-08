// A charge list's totals (LP-218): time with its range, fine, and the charges left to the judge.
// Shared by the Law Library's charge calculator and a case's attached charges (LP-236).

import { chargeTotals, discretionText, timeText, totalFineText, type ChargeLine } from "@/lib/chargeList";
import { PENAL_CODE, type PenalCode } from "@/lib/penalCode";

export default function ChargeTotals({
  list,
  idPrefix,
  code = PENAL_CODE,
}: {
  list: readonly ChargeLine[];
  idPrefix: string;
  code?: PenalCode;
}) {
  const t = chargeTotals(list, code);
  const time = timeText(t);
  return (
    <dl className="charge-totals" id={idPrefix + "-totals"}>
      {time && (
        <>
          <dt>Time</dt>
          <dd id={idPrefix + "-time"}>{time}</dd>
        </>
      )}
      <dt>Fine</dt>
      <dd id={idPrefix + "-fine"}>{totalFineText(t)}</dd>
      {t.discretion.length > 0 && (
        <>
          <dt>Judge&apos;s discretion</dt>
          <dd id={idPrefix + "-discretion"}>{t.discretion.map(discretionText).join(", ")}</dd>
        </>
      )}
    </dl>
  );
}
