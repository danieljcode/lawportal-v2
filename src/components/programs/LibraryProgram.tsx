// The Law Library program (LP-103): the penal code (#library/penal-code) and
// the firm's precedents (#library/precedents).

import ErrorBoundary from "../ErrorBoundary";
import LawLibraryView from "../LawLibraryView";
import type { ProgramProps } from "./shell";

export default function LibraryProgram({ shell }: ProgramProps) {
  const page = shell.route.program === "library" ? shell.route.page : "penal-code";
  return (
    <div className="layout no-nav">
      <main className="editor" id="editor">
        <ErrorBoundary where="the Law Library" resetKey={page}>
          <LawLibraryView tab={page === "precedents" ? "precedents" : "code"} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
