// The modern shell's home screen (LP-127): a tile for each program the active
// character can see, and what needs attention: deadlines due within 48 hours or
// overdue (LP-18), the latest filings to open again (LP-15) and the cases worked
// on most recently, each one click away. Everything is for the character you're
// filing as (the whole firm with no character). Classic keeps the Program
// Manager (LP-104) as its home.

import { useMemo } from "react";
import { caseStore, isMember } from "@/lib/cases";
import { formatDay, gameToday, relativeDay, SOON_DAYS, upcoming } from "@/lib/deadlines";
import { snapshotTime } from "@/lib/draftHistory";
import { filingStore, type Filing } from "@/lib/filings";
import type { Case, Character } from "@/lib/types";
import type { ProgramDef } from "./programs/registry";
import { useCaseVersion, useFilingVersion } from "./useStore";

/** How many recent filings and cases the home screen lists. */
export const RECENT = 5;

export interface ModernHomeProps {
  /** The programs the active character can see. */
  programs: readonly ProgramDef[];
  /** Where each tile goes: back to where the program was left (LP-126), or its start. */
  hrefFor(program: ProgramDef): string;
  active: Character | null;
  /** Open a filing again as a draft of its form (App's openFiling). */
  onOpenFiling(f: Filing): void;
}

const caseName = (c: Case) =>
  c.caseNumber + (c.plaintiff || c.defendant ? " · " + [c.plaintiff, c.defendant].filter(Boolean).join(" v. ") : "");

export default function ModernHome({ programs, hrefFor, active, onOpenFiling }: ModernHomeProps) {
  const caseVersion = useCaseVersion();
  const filingVersion = useFilingVersion();
  const today = gameToday();
  const charId = active ? active.id : null;

  const { due, cases } = useMemo(() => {
    const all = caseVersion >= 0 ? caseStore().list() : [];
    const mine = charId ? all.filter((c) => isMember(c, charId)) : all;
    return {
      due: upcoming(mine, null, today, SOON_DAYS),
      cases: [...mine].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0)).slice(0, RECENT),
    };
  }, [caseVersion, charId, today]);
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
          <section className="home-card" aria-labelledby="home-due-title">
            <h3 id="home-due-title">Due in 48 hours or overdue</h3>
            {due.length ? (
              <ul className="home-list" id="home-due">
                {due.map(({ case: c, deadline: d, overdue }) => (
                  <li key={c.id + ":" + d.id} className={overdue ? "overdue" : "soon"}>
                    <a href={"#cases/" + c.id}>
                      <strong>{d.label}</strong>
                      <span className="small">
                        {formatDay(d.date) +
                          ", " +
                          (overdue ? "overdue, " + relativeDay(d.date, today) : relativeDay(d.date, today))}
                      </span>
                      <span className="small muted">{caseName(c)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" id="home-due-empty">
                Nothing due in the next 48 hours on {whose} cases.
              </p>
            )}
            <a className="small" href="#cases/upcoming">
              See everything upcoming
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
