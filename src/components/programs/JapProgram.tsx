// The J.A.P. program (LP-103): a Court Commissioner's Judicial Advancement
// Portfolio, with its output beside it.

import ErrorBoundary from "../ErrorBoundary";
import JapOutput from "../JapOutput";
import JapView from "../JapView";
import type { ProgramProps } from "./shell";

export default function JapProgram({ shell }: ProgramProps) {
  const { active, commissioner } = shell;
  const showOutput = commissioner && !!active;
  return (
    <div className={"layout no-nav" + (showOutput ? " with-output" : "")}>
      <main className="editor" id="editor">
        <ErrorBoundary where="the J.A.P." resetKey="jap">
          <JapView
            commissioner={commissioner ? active : null}
            syncOn={shell.syncOn}
            syncState={shell.syncState}
            onTurnOnSync={() => shell.openCharacters(true)}
          />
        </ErrorBoundary>
      </main>
      {showOutput && active && (
        <ErrorBoundary where="the J.A.P. output" resetKey={active.id}>
          <JapOutput character={active} />
        </ErrorBoundary>
      )}
    </div>
  );
}
