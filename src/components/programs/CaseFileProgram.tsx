// The Case File program (LP-103, LP-106): the firm's cases (#cases, #cases/<id>)
// and what's due (#cases/upcoming), with a navigation pane for All cases,
// Upcoming and the open case, and links across to the Clients program.

import { useMemo } from "react";
import { caseStore } from "@/lib/cases";
import { dueSoonCount, gameToday } from "@/lib/deadlines";
import CaseFileView from "../CaseFileView";
import ErrorBoundary from "../ErrorBoundary";
import UpcomingView from "../UpcomingView";
import { useCaseVersion } from "../useStore";
import type { ProgramProps } from "./shell";

export default function CaseFileProgram({ shell }: ProgramProps) {
  const r = shell.route;
  const upcoming = r.program === "cases" && !!r.upcoming;
  const caseId = r.program === "cases" ? r.caseId : null;
  const version = useCaseVersion();
  const open = useMemo(() => (caseId && version >= 0 ? caseStore().get(caseId) : null), [caseId, version]);
  const today = gameToday();
  const due = useMemo(
    () => (version >= 0 ? dueSoonCount(caseStore().list(), shell.active ? shell.active.id : null, today) : 0),
    [version, shell.active, today],
  );

  const link = (href: string, text: string, on: boolean, id: string) => (
    <a href={href} id={id} className={on ? "active" : undefined} aria-current={on ? "page" : undefined}>
      {text}
    </a>
  );

  return (
    <div className="layout">
      <nav className="sidebar case-nav" id="case-nav" aria-label="Case File">
        <div className="tree">
          <details open>
            <summary>Case File</summary>
            <ul>
              <li>{link("#cases", "All cases", !upcoming && !caseId, "case-nav-all")}</li>
              <li>
                {link(
                  "#cases/upcoming",
                  "Upcoming" + (due ? " (" + due + " due soon)" : ""),
                  upcoming,
                  "case-nav-upcoming",
                )}
              </li>
              {caseId && (
                <li className="case-nav-open">
                  {link("#cases/" + caseId, open ? open.caseNumber : "Missing case", true, "case-nav-open")}
                </li>
              )}
            </ul>
          </details>
          <details open>
            <summary>Clients</summary>
            <ul>
              <li>
                <a href="#clients/intake" id="case-nav-intake">
                  New case from intake
                </a>
              </li>
              <li>
                <a href="#clients/conflicts" id="case-nav-conflicts">
                  Run conflict check
                </a>
              </li>
            </ul>
          </details>
        </div>
      </nav>
      <main className="editor" id="editor">
        {upcoming ? (
          <ErrorBoundary where="Upcoming" resetKey="upcoming">
            <UpcomingView character={shell.active} />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary where="the Case File" resetKey={caseId}>
            <CaseFileView
              caseId={caseId}
              characters={shell.characters}
              activeCharacter={shell.active}
              onUseFiling={shell.openFiling}
            />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
