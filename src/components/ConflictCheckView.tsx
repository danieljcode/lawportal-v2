// Conflict check (LP-10): names against every firm case, a clear verdict, the
// matches (case, side, status, lead), a memo to copy or print, and the log of
// checks run. ConflictResult is also shown by the new client intake (LP-19).

import { useMemo, useState, type FormEvent } from "react";
import { copyText } from "@/lib/clipboard";
import { conflictLog, conflictMemo, SIDE_LABELS, VERDICT_CLEAR, VERDICT_REVIEW } from "@/lib/conflicts";
import { gameToday } from "@/lib/deadlines";
import { snapshotTime } from "@/lib/draftHistory";
import { runConflictCheck, type ConflictRun } from "@/lib/services/conflicts";
import type { Character } from "@/lib/types";
import { useConflictLogVersion } from "./useStore";

export interface ConflictResultProps {
  run: ConflictRun;
  characters: Character[];
  runBy: Character | null;
  /** Show Copy memo and Print memo (the Conflict check program). */
  memoActions?: boolean;
}

/** The verdict banner, the matches and (optionally) the memo. */
export function ConflictResult({ run, characters, runBy, memoActions }: ConflictResultProps) {
  const [status, setStatus] = useState("");
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name || "Unknown character";
  const clear = run.matches.length === 0;
  const memo = conflictMemo(run.names, run.matches, gameToday(), runBy?.name, nameOf);

  return (
    <div className="conflict-result" id="conflict-result">
      <p className={"conflict-verdict " + (clear ? "clear" : "review")} id="conflict-verdict" role="status">
        {clear ? VERDICT_CLEAR : VERDICT_REVIEW}
      </p>
      {!clear && (
        <ul className="conflict-matches" id="conflict-matches">
          {run.matches.map((m, i) => (
            <li key={m.caseId + m.side + i}>
              <a href={"#cases/" + m.caseId}>
                <strong>{m.caseNumber}</strong>
              </a>
              <span>{SIDE_LABELS[m.side]}</span>
              <span className="small muted">
                {[m.status, "Lead: " + (m.lead ? nameOf(m.lead) : "none")].join(" · ")}
              </span>
              <span className="small">
                {'"' + m.searched + '" matched "' + m.matched + '"' + (m.strength === "partial" ? " (partial)" : "")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {memoActions && (
        <>
          <pre className="conflict-memo" id="conflict-memo">
            {memo}
          </pre>
          <div className="row">
            <button
              type="button"
              className="btn"
              id="conflict-copy"
              onClick={() =>
                void copyText(memo).then((ok) => setStatus(ok ? "Memo copied." : "Copy failed: select the memo."))
              }
            >
              Copy memo
            </button>
            <button type="button" className="btn" id="conflict-print" onClick={() => window.print()}>
              Print memo
            </button>
            <span className="small" role="status">
              {status}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** A check started elsewhere (intake's Run conflict check, LP-107): its names and result; each new `seq` once. */
export interface ConflictRequest {
  names: string[];
  run: ConflictRun;
  seq: number;
}

export interface ConflictCheckViewProps {
  characters: Character[];
  active: Character | null;
  request?: ConflictRequest | null;
}

export default function ConflictCheckView({ characters, active, request = null }: ConflictCheckViewProps) {
  const [text, setText] = useState(() => (request ? request.names.join("\n") : ""));
  const [run, setRun] = useState<ConflictRun | null>(() => (request ? request.run : null));
  // A new check from intake fills in its names and shows its result (adjusted while rendering).
  const [seenSeq, setSeenSeq] = useState(request ? request.seq : 0);
  if (request && request.seq !== seenSeq) {
    setSeenSeq(request.seq);
    setText(request.names.join("\n"));
    setRun(request.run);
  }
  const [error, setError] = useState("");
  const version = useConflictLogVersion();
  const log = useMemo(() => (version >= 0 ? conflictLog().list().slice(0, 20) : []), [version]);

  const check = (e: FormEvent) => {
    e.preventDefault();
    const names = text.split("\n").filter((n) => n.trim());
    if (!names.length) {
      setError("Type at least one name: a person or a business.");
      return;
    }
    setError("");
    setRun(runConflictCheck(names, active));
  };

  return (
    <section id="conflicts" className="form-view conflicts">
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="conflicts-title">Conflict check</h2>
        </div>
      </div>
      <form id="conflict-form" className="case-form" noValidate onSubmit={check}>
        <div className="field">
          <label htmlFor="conflict-names">Names to check, one per line (people or businesses)</label>
          <textarea
            id="conflict-names"
            rows={4}
            placeholder={"Ann Lee\nLos Santos Customs"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="help">
            Checks both sides of every firm case and the case notes. Capitals and punctuation don&apos;t matter, part of
            a name finds the whole name, and initials work (A. Lee finds Ann Lee).
          </p>
        </div>
        <p className="error" role="alert" id="conflict-error">
          {error}
        </p>
        <div className="row">
          <button type="submit" className="btn primary" id="conflict-run">
            Check
          </button>
        </div>
      </form>

      {run && <ConflictResult run={run} characters={characters} runBy={active} memoActions />}

      <section className="conflict-log" aria-labelledby="conflict-log-title">
        <h3 id="conflict-log-title">Checks run</h3>
        {log.length ? (
          <ul id="conflict-log">
            {log.map((c) => (
              <li key={c.id}>
                <strong>{c.names.join("; ")}</strong>
                <span className="small muted">
                  {[
                    snapshotTime(c.at),
                    c.charName,
                    c.matches ? c.matches + " possible conflict" + (c.matches === 1 ? "" : "s") : "no conflicts",
                    c.caseNumbers.join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted" id="conflict-log-empty">
            No checks yet. Every check is kept here (who, when, the names and the result) so the firm can show it was
            done.
          </p>
        )}
      </section>
    </section>
  );
}
