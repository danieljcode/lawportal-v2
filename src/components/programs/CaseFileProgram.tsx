// The Case File program (LP-103): the firm's cases (#cases, #cases/<id>) and
// what's due (#cases/upcoming).

import CaseFileView from "../CaseFileView";
import ErrorBoundary from "../ErrorBoundary";
import UpcomingView from "../UpcomingView";
import type { ProgramProps } from "./shell";

export default function CaseFileProgram({ shell }: ProgramProps) {
  const r = shell.route;
  const upcoming = r.program === "cases" && !!r.upcoming;
  const caseId = r.program === "cases" ? r.caseId : null;
  return (
    <div className="layout no-nav">
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
