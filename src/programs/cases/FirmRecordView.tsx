// The Firm Record (LP-92): closed cases by outcome, with the win rate, for the firm
// and each lawyer, by matter type and dates; each lawyer's cases link back to the
// Case File. It prints, or copies as a few lines of text. Dates are in-game.

import { useMemo, useState } from "react";
import { BRANDING } from "@/branding";
import { caseStore } from "@/lib/cases";
import { copyText } from "@/lib/clipboard";
import { formatDay } from "@/lib/deadlines";
import { firmRecord, MATTERS, matterOf, OUTCOME_ORDER, recordSummary, winRateText, type Tally } from "@/lib/firmRecord";
import { OUTCOME_LABELS } from "@/lib/outcomes";
import type { Case, Character } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";
import { printAs } from "@/ui/printAs";
import { useCaseVersion } from "@/ui/useStore";

const caseName = (c: Case) =>
  c.caseNumber + (c.plaintiff || c.defendant ? " · " + [c.plaintiff, c.defendant].filter(Boolean).join(" v. ") : "");

function TallyRow({ name, tally }: { name: string; tally: Tally }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td className="num">{tally.cases}</td>
      {OUTCOME_ORDER.map((r) => (
        <td key={r} className="num">
          {tally[r]}
        </td>
      ))}
      <td className="num">{winRateText(tally)}</td>
    </tr>
  );
}

export default function FirmRecordView({ characters }: { characters: Character[] }) {
  const version = useCaseVersion();
  const [matter, setMatter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [printing, setPrinting] = useState(false);
  const filter = useMemo(
    () => ({ ...(matter ? { matter } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [matter, from, to],
  );
  const record = useMemo(
    () => firmRecord(version >= 0 ? caseStore().list() : [], characters, filter),
    [version, characters, filter],
  );

  const copy = async () => {
    const ok = await copyText(recordSummary(BRANDING.shortName, record, filter));
    setStatus({ text: ok ? "Copied." : "Copy failed.", bad: !ok });
  };

  return (
    <section
      id={printing ? "record-print-sheet" : "firm-record"}
      className="form-view upcoming"
      aria-labelledby="firm-record-title"
    >
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="firm-record-title">Firm Record</h2>
        </div>
        <div className="form-head-actions record-actions">
          <button type="button" className="btn" id="record-print" onClick={() => printAs("Firm Record", setPrinting)}>
            Print / PDF
          </button>
          <button type="button" className="btn" id="record-copy" onClick={() => void copy()}>
            Copy summary
          </button>
        </div>
      </div>
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status" id="record-status">
        {status?.text || ""}
      </p>
      <div className="record-filters">
        <div className="field">
          <label htmlFor="record-matter">Matter type</label>
          <select id="record-matter" value={matter} onChange={(e) => setMatter(e.target.value)}>
            <option value="">All matters</option>
            {MATTERS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="record-from">From</label>
          <GameDateInput id="record-from" aria-label="From" value={from} onChange={setFrom} />
        </div>
        <div className="field">
          <label htmlFor="record-to">To</label>
          <GameDateInput id="record-to" aria-label="To" value={to} onChange={setTo} />
        </div>
      </div>

      {record.firm.cases ? (
        <>
          <div className="record-scroll">
            <table className="record-table" id="record-table">
              <caption className="sr-only">Outcomes for the firm and each lawyer</caption>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col" className="num">
                    Cases
                  </th>
                  {OUTCOME_ORDER.map((r) => (
                    <th key={r} scope="col" className="num">
                      {OUTCOME_LABELS[r]}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    Win rate
                  </th>
                </tr>
              </thead>
              <tbody>
                <TallyRow name="The firm" tally={record.firm} />
                {record.lawyers.map((l) => (
                  <TallyRow key={l.id} name={l.name} tally={l.tally} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Win rate is wins out of the cases won or lost.</p>
          {record.lawyers.map((l) => (
            <section key={l.id} className="record-lawyer" aria-label={l.name + "'s cases"}>
              <h3>{l.name}</h3>
              <ul className="upcoming-list">
                {l.cases.map((c) => (
                  <li key={c.id} className="upcoming-item">
                    <span className="upcoming-when">
                      <strong>{OUTCOME_LABELS[c.outcome!.result]}</strong>
                      <span className="small">{formatDay(c.outcome!.date)}</span>
                    </span>
                    <span className="upcoming-what">
                      <a href={"#cases/" + c.id}>{caseName(c)}</a>
                      <span className="small muted">{matterOf(c)}</span>
                      {c.outcome!.note && <span className="small muted">{c.outcome!.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <p id="record-empty">No outcomes to show. Close a case and record how it ended, and it counts here.</p>
      )}

      {record.unrecorded.length > 0 && (
        <section className="record-lawyer" id="record-unrecorded" aria-labelledby="record-unrecorded-title">
          <h3 id="record-unrecorded-title">Closed with no outcome yet</h3>
          <p className="small muted">Open a case and pick its outcome to count it.</p>
          <ul className="record-open-list">
            {record.unrecorded.map((c) => (
              <li key={c.id}>
                <a href={"#cases/" + c.id}>{caseName(c)}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
