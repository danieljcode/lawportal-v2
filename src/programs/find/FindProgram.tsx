// The Find program (LP-95): one search box over the firm's records, results grouped
// by type with the search words marked, each opening in its own program.
// Ctrl+Shift+F (Cmd+Shift+F) opens it from anywhere.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { caseStore } from "@/lib/cases";
import { contactStore } from "@/lib/contacts";
import { filingStore } from "@/lib/filings";
import { FIND_LABELS, find, findIndex } from "@/lib/find";
import { invoiceStore } from "@/lib/invoices";
import { timeStore } from "@/lib/ledger";
import { searchTerms } from "@/lib/precedents";
import ErrorBoundary from "@/ui/ErrorBoundary";
import Marked from "@/ui/Marked";
import { useCaseVersion, useContactVersion, useFilingVersion, useInvoiceVersion, useTimeVersion } from "@/ui/useStore";
import type { ProgramProps } from "@/shell/program";

function FindView({ shell }: ProgramProps) {
  // Every store's version counts up on each change, so their sum changes when any store does.
  const version = useCaseVersion() + useContactVersion() + useFilingVersion() + useInvoiceVersion() + useTimeVersion();
  const { characters } = shell;
  const index = useMemo(
    () =>
      version >= 0
        ? findIndex({
            cases: caseStore().list(),
            contacts: contactStore().list(),
            filings: filingStore().list(),
            invoices: invoiceStore().list(),
            time: timeStore().list(),
            nameOf: (id) => characters.find((c) => c.id === id)?.name || "Deleted character",
          })
        : [],
    [version, characters],
  );
  const [q, setQ] = useState("");
  // Ready to type in when Find opens (its code may still be loading when Ctrl+Shift+F is pressed).
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), []);
  const query = useDeferredValue(q);
  const groups = useMemo(() => find(index, query), [index, query]);
  const terms = useMemo(() => searchTerms(query), [query]);

  return (
    <section id="find" className="form-view">
      <div className="form-head">
        <div>
          <h2 id="find-title">Find</h2>
        </div>
      </div>
      <input
        type="search"
        id="find-q"
        ref={box}
        className="find-box"
        placeholder="Case number, name, exhibit, invoice…"
        aria-label="Find in the firm's records"
        aria-describedby="find-count"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="small muted" id="find-count" role="status">
        {!query.trim()
          ? "Searches cases, contacts, filings, exhibits, invoices and time."
          : groups.length
            ? groups.reduce((n, g) => n + g.total, 0) + " found"
            : "Nothing found."}
      </p>
      {groups.map((g) => (
        <section key={g.kind} className="find-group" aria-labelledby={"find-" + g.kind}>
          <h3 id={"find-" + g.kind}>
            {FIND_LABELS[g.kind]} <span className="small muted">{g.total}</span>
          </h3>
          <ul className="find-list">
            {g.items.map((it) => (
              <li key={it.id}>
                <a href={it.href} id={it.id}>
                  <strong>
                    <Marked text={it.title} terms={terms} />
                  </strong>
                  {it.detail && (
                    <span className="small muted">
                      <Marked text={it.detail} terms={terms} />
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          {g.total > g.items.length && (
            <p className="small muted">{"And " + (g.total - g.items.length) + " more: add a word to narrow it."}</p>
          )}
        </section>
      ))}
    </section>
  );
}

export default function FindProgram(props: ProgramProps) {
  return (
    <div className="layout no-nav">
      <main className="editor" id={props.shell.visible ? "editor" : undefined}>
        <ErrorBoundary where="Find" resetKey="find">
          <FindView {...props} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
