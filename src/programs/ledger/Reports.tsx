// Partner reports (LP-34): hours per character, revenue by month and open cases
// by status, for a date range and character, each a table with bars and a CSV.

import { useMemo, useState } from "react";
import { download } from "@/lib/download";
import { invoiceStore } from "@/lib/invoices";
import type { TimeEntry } from "@/lib/ledger";
import { casesReport, hoursReport, reportCsv, revenueReport, type Report, type ReportFilter } from "@/lib/reports";
import type { Case } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";
import { useInvoiceVersion } from "@/ui/useStore";
import type { ProgramProps } from "@/shell/program";

function ReportTable({ report, id }: { report: Report; id: string }) {
  const top = Math.max(0, ...report.bars);
  return (
    <div className="report" id={id}>
      <div className="row ledger-head">
        <h4 id={id + "-title"}>{report.title}</h4>
        <button
          type="button"
          className="mini"
          id={id + "-csv"}
          disabled={!report.rows.length}
          onClick={() => download(reportCsv(report), id + ".csv", "text/csv")}
        >
          Download CSV
        </button>
      </div>
      {report.rows.length ? (
        <div className="ledger-scroll">
          <table className="ledger-table report-table" aria-labelledby={id + "-title"}>
            <thead>
              <tr>
                {report.columns.map((c, i) => (
                  <th key={c} scope="col" className={i ? "num" : undefined}>
                    {c}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Chart</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} className={i ? "num" : undefined}>
                      {cell}
                    </td>
                  ))}
                  <td className="report-bar-cell" aria-hidden="true">
                    <span className="report-bar" style={{ width: (top ? (report.bars[r] / top) * 100 : 0) + "%" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small muted">Nothing in this range.</p>
      )}
    </div>
  );
}

export default function Reports({
  entries,
  cases,
  characters,
  nameOf,
  rateOf,
}: {
  entries: readonly TimeEntry[];
  cases: readonly Case[];
  characters: ProgramProps["shell"]["characters"];
  nameOf(id: string): string;
  rateOf(e: TimeEntry): number | null;
}) {
  const invoiceVersion = useInvoiceVersion();
  const invoices = useMemo(() => (invoiceVersion >= 0 ? invoiceStore().list() : []), [invoiceVersion]);
  const [f, setF] = useState<ReportFilter>({});
  const set = (k: keyof ReportFilter) => (v: string) => setF({ ...f, [k]: v || undefined });

  return (
    <section className="invoices" id="reports" aria-labelledby="reports-title">
      <h3 id="reports-title">Reports</h3>
      <div className="row ledger-filters">
        <select
          id="report-character"
          aria-label="Character"
          value={f.character || ""}
          onChange={(e) => set("character")(e.target.value)}
        >
          <option value="">Everyone</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <GameDateInput id="report-from" aria-label="From" value={f.from || ""} onChange={set("from")} />
        <GameDateInput id="report-to" aria-label="To" value={f.to || ""} onChange={set("to")} />
      </div>
      <ReportTable id="report-hours" report={hoursReport(entries, f, nameOf, rateOf)} />
      <ReportTable id="report-revenue" report={revenueReport(invoices, f)} />
      <p className="small muted">
        Revenue is the whole firm&apos;s: billed by the month issued, received by the month paid.
      </p>
      <ReportTable id="report-cases" report={casesReport(cases, f)} />
    </section>
  );
}
