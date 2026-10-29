// An exhibit's chain of custody (LP-14): the entries, oldest first, and a form
// to add one (in-game time, action, who, note). Entries are never edited or
// removed here: a mistake is corrected with a new entry. Copy for filing puts
// the log on the clipboard as a numbered list; Print prints just the log.

import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { fromHtml } from "@/lib/bbcode";
import { copyRich } from "@/lib/clipboard";
import {
  ACTION_LABELS,
  appendCustody,
  cleanCustodyEntry,
  CUSTODY_ACTIONS,
  custodyHtml,
  custodyLine,
  custodyTitle,
  formatAt,
  gameNow,
  isCustodyTime,
  MAX_CUSTODY,
  type CustodyAction,
  type CustodyEntry,
} from "@/lib/custody";
import type { Character, Exhibit } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";

export interface ExhibitCustodyProps {
  exhibit: Exhibit;
  letter: string;
  characters: Character[];
  active: Character | null;
  /** Save the exhibit's new log; false when it couldn't be saved (the error is shown by the caller). */
  onSave(custody: CustodyEntry[]): boolean;
}

export default function ExhibitCustody({ exhibit, letter, characters, active, onSave }: ExhibitCustodyProps) {
  const log = exhibit.custody || [];
  const [at, setAt] = useState(() => gameNow());
  const [action, setAction] = useState<CustodyAction>(log.length ? "reviewed" : "received");
  const [who, setWho] = useState(() => active?.id || characters[0]?.id || "");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [printing, setPrinting] = useState(false);

  // The sheet exists only while the print dialog is open, so printing shows just this log.
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  };

  const character = characters.find((c) => c.id === who);

  const add = (ev: FormEvent) => {
    ev.preventDefault();
    if (!isCustodyTime(at)) {
      setStatus({ text: "Give the date and time it happened (in-game).", bad: true });
      return;
    }
    const by = character ? character.name : name.trim();
    if (!by) {
      setStatus({ text: "Say who handled the exhibit.", bad: true });
      return;
    }
    if (log.length >= MAX_CUSTODY) {
      setStatus({ text: "An exhibit's log can hold up to " + MAX_CUSTODY + " entries.", bad: true });
      return;
    }
    const entry = cleanCustodyEntry({ at, action, by, byId: character?.id, note });
    if (!entry) return;
    if (onSave(appendCustody(log, entry))) {
      setNote("");
      setStatus({ text: "Added: " + custodyLine(entry), bad: false });
    }
  };

  const copy = async () => {
    const html = custodyHtml(letter, exhibit.title, log);
    const ok = await copyRich(html, fromHtml(html));
    setStatus(
      ok
        ? { text: "Copied the chain of custody. Paste it into your filing.", bad: false }
        : { text: "Copy failed: try again.", bad: true },
    );
  };

  return (
    <div className="custody" aria-label={"Chain of custody for Exhibit " + letter}>
      {log.length ? (
        <ol className="custody-list">
          {log.map((e) => (
            <li key={e.id}>
              <span className="custody-at">{formatAt(e.at)}</span>
              <strong className="custody-action">{ACTION_LABELS[e.action]}</strong>
              <span className="custody-by">{"by " + e.by}</span>
              {e.note && <span className="custody-note">{e.note}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="small muted custody-empty">No one has logged handling this exhibit yet.</p>
      )}
      <form className="custody-form" noValidate onSubmit={add} aria-label={"Add a custody entry for Exhibit " + letter}>
        <GameDateInput withTime aria-label="When (in-game)" value={at} onChange={setAt} />
        <select
          className="custody-action-input"
          aria-label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value as CustodyAction)}
        >
          {CUSTODY_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          className="custody-who-input"
          aria-label="Handled by"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="">Someone else…</option>
        </select>
        {!character && (
          <input
            type="text"
            className="custody-name-input"
            aria-label="Their name"
            placeholder="Their name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          type="text"
          className="custody-note-input"
          aria-label="Note"
          placeholder="Note (optional), e.g. sealed in bag 14"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row">
          <button type="submit" className="btn primary custody-add">
            Add entry
          </button>
          <button type="button" className="btn custody-copy" disabled={!log.length} onClick={() => void copy()}>
            Copy for filing
          </button>
          <button type="button" className="btn custody-print" disabled={!log.length} onClick={print}>
            Print
          </button>
        </div>
      </form>
      <p className="small muted">Entries can&apos;t be changed or removed. To correct one, add a new entry.</p>
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status">
        {status?.text || ""}
      </p>
      {printing && (
        <div className="custody-sheet" id="custody-sheet">
          <h3>{custodyTitle(letter, exhibit.title)}</h3>
          <ol>
            {log.map((e) => (
              <li key={e.id}>{custodyLine(e)}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
