// The modern shell's home screen (LP-127): a tile for each program the active
// character can see, and what needs attention: the work list (LP-171) of court
// deadlines, next actions and unpaid invoices, overdue first, then the latest
// filings to open again (LP-15) and the cases worked on most recently, each one
// click away. The work list shows My work or All firm work; the rest is for the
// character you're filing as (the whole firm with no character). Classic keeps
// the Program Manager (LP-104) as its home.

import { useMemo, useState } from "react";
import { caseStore, isMember } from "@/lib/cases";
import { formatDay, gameToday, relativeDay, SOON_DAYS, upcoming } from "@/lib/deadlines";
import { snapshotTime } from "@/lib/draftHistory";
import { filingStore, type Filing } from "@/lib/filings";
import { invoiceStore } from "@/lib/invoices";
import { formatMoney } from "@/lib/ledger";
import type { Case, Character } from "@/lib/types";
import { workItems, type WorkItem } from "@/lib/work";
import type { ProgramDef } from "./registry";
import { useCaseVersion, useFilingVersion, useInvoiceVersion } from "@/ui/useStore";

/** How many recent filings and cases the home screen lists. */
export const RECENT = 5;
/** How many work items the home screen lists, most urgent first. */
export const WORK_SHOWN = 10;

const KIND_LABELS = { deadline: "Court", action: "Action", invoice: "Billing" } as const;

export interface ModernHomeProps {
  /** The programs the active character can see. */
  programs: readonly ProgramDef[];
  /** Where each tile goes: back to where the program was left (LP-126), or its start. */
  hrefFor(program: ProgramDef): string;
  active: Character | null;
  /** Every character, for who an action is given to in All firm work. */
  characters: readonly Character[];
  /** Open a filing again as a draft of its form (App's openFiling). */
  onOpenFiling(f: Filing): void;
}

const caseName = (c: Case) =>
  c.caseNumber + (c.plaintiff || c.defendant ? " · " + [c.plaintiff, c.defendant].filter(Boolean).join(" v. ") : "");

export default function ModernHome({ programs, hrefFor, active, characters, onOpenFiling }: ModernHomeProps) {
  const caseVersion = useCaseVersion();
  const filingVersion = useFilingVersion();
  const invoiceVersion = useInvoiceVersion();
  const today = gameToday();
  const charId = active ? active.id : null;
  const [firmWide, setFirmWide] = useState(false);
  const workFor = firmWide ? null : charId;

  const { all, due, cases } = useMemo(() => {
    const all = caseVersion >= 0 ? caseStore().list() : [];
    const mine = charId ? all.filter((c) => isMember(c, charId)) : all;
    return {
      all,
      due: upcoming(mine, null, today, SOON_DAYS),
      cases: [...mine].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0)).slice(0, RECENT),
    };
  }, [caseVersion, charId, today]);
  const work = useMemo(
    () =>
      workItems({
        cases: all,
        invoices: invoiceVersion >= 0 ? invoiceStore().list() : [],
        charId: workFor,
        today,
      }),
    [all, invoiceVersion, workFor, today],
  );
  const filings = useMemo(
    () =>
      filingVersion >= 0
        ? filingStore()
            .list()
            .filter((f) => !charId || f.charId === charId)
            .slice(0, RECENT)
        : [],
    [filingVersion, charId],
  );

  const whose = active ? active.name + "'s" : "the firm's";

  return (
    <div className="layout no-nav">
      <main className="editor home" id="home">
        <section className="home-section" aria-labelledby="home-programs-title">
          <h2 className="home-heading" id="home-programs-title">
            Programs
          </h2>
          <ul className="home-tiles">
            {programs.map((p) => {
              const soon = p.id === "cases" && due.length > 0;
              return (
                <li key={p.id}>
                  <a
                    className="home-tile"
                    id={"tile-" + p.id}
                    href={hrefFor(p)}
                    aria-label={soon ? p.title + " (" + due.length + " due soon)" : undefined}
                  >
                    <span className="home-tile-icon" aria-hidden="true">
                      {p.icon}
                      {soon && <span className="pm-badge" />}
                    </span>
                    <span className="home-tile-label">{p.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <h2 className="home-heading">Needs attention</h2>
        <div className="home-attention">
          <section className="home-card home-work" aria-labelledby="home-work-title">
            <div className="home-work-head">
              <h3 id="home-work-title">{workFor && active ? "My work: " + active.name : "All firm work"}</h3>
              {active && (
                <div className="home-scope" role="group" aria-label="Whose work">
                  {[false, true].map((firm) => (
                    <button
                      key={String(firm)}
                      type="button"
                      className="mini"
                      id={firm ? "home-scope-firm" : "home-scope-mine"}
                      aria-pressed={firmWide === firm}
                      onClick={() => setFirmWide(firm)}
                    >
                      {firm ? "All firm" : "My work"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {work.length ? (
              <>
                <ul className="home-list" id="home-work">
                  {work.slice(0, WORK_SHOWN).map((item) => (
                    <WorkRow
                      key={item.key}
                      item={item}
                      today={today}
                      ownerName={(id) =>
                        workFor
                          ? ""
                          : id
                            ? characters.find((c) => c.id === id)?.name || "Unknown character"
                            : "Unassigned"
                      }
                    />
                  ))}
                </ul>
                {work.length > WORK_SHOWN && (
                  <p className="small muted" id="home-work-more">
                    The {WORK_SHOWN} most urgent of {work.length}.
                  </p>
                )}
              </>
            ) : (
              <p className="muted" id="home-work-empty">
                Nothing needs attention{workFor ? " in " + whose + " work" : " for the firm"}: no court dates or actions
                in the next two weeks, and no unpaid invoices.
              </p>
            )}
            <a className="small" href="#cases/upcoming">
              See every upcoming court date
            </a>
          </section>

          <section className="home-card" aria-labelledby="home-filings-title">
            <h3 id="home-filings-title">Recent filings</h3>
            {filings.length ? (
              <ul className="home-list" id="home-filings">
                {filings.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="home-link"
                      title={"Open " + f.formTitle + " again with these details"}
                      onClick={() => onOpenFiling(f)}
                    >
                      <strong>{f.formTitle}</strong>
                      <span className="small muted">
                        {[snapshotTime(f.at), f.caseNumber, active ? "" : f.charName].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" id="home-filings-empty">
                No filings yet. Ones you copy or download from Court Filings show here.
              </p>
            )}
          </section>

          <section className="home-card" aria-labelledby="home-cases-title">
            <h3 id="home-cases-title">Recent cases</h3>
            {cases.length ? (
              <ul className="home-list" id="home-cases">
                {cases.map((c) => (
                  <li key={c.id}>
                    <a href={"#cases/" + c.id}>
                      <strong>{caseName(c)}</strong>
                      <span className="small muted">{c.status}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" id="home-cases-empty">
                No cases on {whose} docket yet. <a href="#clients/intake">Open one from a new client</a>.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** One work item: each links to its case or the Ledger; an action can be ticked off here too. */
function WorkRow({
  item,
  today,
  ownerName,
}: {
  item: WorkItem;
  today: string;
  /** Who an action is given to, or "" in My work. */
  ownerName(id?: string): string;
}) {
  const c = item.case;
  const bill = item.kind === "invoice" ? item.invoice : null;
  const action = item.kind === "action" ? item.action : null;
  const urgency = item.overdue ? "overdue" : item.soon ? "soon" : "";
  const owner = action ? ownerName(action.owner) : "";
  return (
    <li className={action ? ("home-action " + urgency).trim() : urgency || undefined}>
      {action && c && (
        <input
          type="checkbox"
          checked={false}
          aria-label={"Done: " + action.title}
          onChange={() =>
            caseStore().save({
              ...c,
              actions: (c.actions || []).map((a) => (a.id === action.id ? { ...a, done: true } : a)),
            })
          }
        />
      )}
      <a href={bill || !c ? "#ledger" : "#cases/" + c.id}>
        <span className="home-kind">{KIND_LABELS[item.kind]}</span>
        <strong>
          {item.kind === "invoice"
            ? "Invoice " + item.invoice.number + " · " + formatMoney(item.balance) + " owed"
            : item.kind === "action"
              ? item.action.title
              : item.deadline.label}
        </strong>
        <span className="small">
          {(bill ? "Due " : "") +
            formatDay(item.date) +
            ", " +
            (item.overdue ? "overdue, " : "") +
            relativeDay(item.date, today) +
            (owner ? " · " + owner : "")}
        </span>
        <span className="small muted">{c ? caseName(c) : bill?.caseNumber}</span>
      </a>
    </li>
  );
}
