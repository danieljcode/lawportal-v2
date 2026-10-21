// The Clients program (LP-103, LP-107): new client intake (#clients/intake) and
// the conflict check (#clients/conflicts), side by side in its navigation pane.
// Both pages stay mounted, and the one you're not on is hidden, so a half-typed
// intake survives a trip to the conflict check. Intake's Run conflict check
// runs the check and opens it here with the names filled in. The Rolodex (LP-30)
// joins the pane as one more entry.

import { useState } from "react";
import { runConflictCheck } from "@/lib/services/conflicts";
import ConflictCheckView, { type ConflictRequest } from "../ConflictCheckView";
import ErrorBoundary from "../ErrorBoundary";
import IntakeView from "../IntakeView";
import { navigate, type ClientsPage } from "../useRoute";
import type { ProgramProps } from "./shell";

/** The pane's pages, in order (the Rolodex will be one more). */
const PAGES: Array<{ page: ClientsPage; text: string }> = [
  { page: "intake", text: "New client intake" },
  { page: "conflicts", text: "Conflict check" },
];

export default function ClientsProgram({ shell }: ProgramProps) {
  const page: ClientsPage = shell.route.program === "clients" ? shell.route.page : "intake";
  const [request, setRequest] = useState<ConflictRequest | null>(null);

  const checkFromIntake = (names: string[]) => {
    const run = runConflictCheck(names, shell.active);
    setRequest((r) => ({ names, run, seq: (r ? r.seq : 0) + 1 }));
    navigate("#clients/conflicts");
  };

  return (
    <div className="layout">
      <nav className="sidebar clients-nav" id="clients-nav" aria-label="Clients">
        <div className="tree">
          <details open>
            <summary>Clients</summary>
            <ul>
              {PAGES.map((p) => (
                <li key={p.page}>
                  <a
                    href={"#clients/" + p.page}
                    id={"clients-nav-" + p.page}
                    className={page === p.page ? "active" : undefined}
                    aria-current={page === p.page ? "page" : undefined}
                  >
                    {p.text}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </nav>
      <main className="editor" id="editor">
        <div hidden={page !== "intake"}>
          <ErrorBoundary where="the intake" resetKey="intake">
            <IntakeView characters={shell.characters} active={shell.active} onRunConflicts={checkFromIntake} />
          </ErrorBoundary>
        </div>
        <div hidden={page !== "conflicts"}>
          <ErrorBoundary where="the conflict check" resetKey="conflicts">
            <ConflictCheckView characters={shell.characters} active={shell.active} request={request} />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
