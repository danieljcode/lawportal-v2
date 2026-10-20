// The Clients program (LP-103): new client intake (#clients/intake) and the
// conflict check (#clients/conflicts).

import ConflictCheckView from "../ConflictCheckView";
import ErrorBoundary from "../ErrorBoundary";
import IntakeView from "../IntakeView";
import { hashFor } from "../useRoute";
import ProgramTabs from "./ProgramTabs";
import type { ProgramProps } from "./shell";

export default function ClientsProgram({ shell }: ProgramProps) {
  const page = shell.route.program === "clients" ? shell.route.page : "intake";
  return (
    <div className="layout no-nav">
      <main className="editor" id="editor">
        <ProgramTabs
          label="Clients"
          current={hashFor(shell.route)}
          tabs={[
            { href: "#clients/intake", text: "New client intake", id: "clients-tab-intake" },
            { href: "#clients/conflicts", text: "Conflict check", id: "clients-tab-conflicts" },
          ]}
        />
        {page === "conflicts" ? (
          <ErrorBoundary where="the conflict check" resetKey={page}>
            <ConflictCheckView characters={shell.characters} active={shell.active} />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary where="the intake" resetKey={page}>
            <IntakeView characters={shell.characters} active={shell.active} />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
