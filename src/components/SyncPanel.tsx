// "Sync across devices" panel inside the Characters dialog (FR10, INV §a #sync-panel).

import { useEffect, useRef, useState, type FormEvent } from "react";
import { copyText } from "@/lib/clipboard";
import { S_LOST_ITEMS, S_SYNC_OFF, S_SYNC_ON_PARTS } from "@/lib/strings";
import * as sync from "@/lib/sync";
import { useSyncState } from "./useStore";

export interface SyncPanelProps {
  /** Turn sync on as soon as the panel opens (the J.A.P. "Turn on sync" button). */
  autoEnable?: boolean;
  onAutoEnableDone?(): void;
}

const MASK = "••••-••••-••••-••••";

function masked(code: string): string {
  return code.slice(0, 8) + MASK;
}

export default function SyncPanel({ autoEnable = false, onAutoEnableDone }: SyncPanelProps) {
  const st = useSyncState();
  const code = sync.code();
  const on = !!code;
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [typed, setTyped] = useState("");
  /** A thrown error from enable/link/destroy; replaced by the next sync state. */
  const [error, setError] = useState<{ text: string; warn: boolean } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStarted = useRef(false);

  // A new sync state clears the error (set while rendering, not in an effect).
  const [errorFor, setErrorFor] = useState(st);
  if (errorFor !== st) {
    setErrorFor(st);
    setError(null);
  }

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const turnOn = async () => {
    setBusy(true);
    try {
      await sync.enable();
      setShown(true);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : String(err), warn: false });
    } finally {
      setBusy(false);
    }
  };

  // The ref survives StrictMode's effect replay, so one click creates one code.
  useEffect(() => {
    if (!autoEnable || autoStarted.current) return;
    autoStarted.current = true;
    onAutoEnableDone?.();
    // Starting sync is the effect's job here (the J.A.P.'s "Turn on sync" opened this dialog).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- turnOn's setBusy marks the request it starts
    if (!sync.code()) void turnOn();
  }, [autoEnable, onAutoEnableDone]);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    try {
      await sync.link(typed);
      setTyped("");
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : String(err), warn: true });
    }
  };

  const copyCode = async () => {
    if (!code) return;
    const ok = await copyText(code);
    setCopyLabel(ok ? "Copied" : "Copy failed");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyLabel("Copy"), 2000);
  };

  const stop = () => {
    if (
      !confirm(
        "Stop syncing on this device? Your characters stay in this browser, and the server copy stays for your other devices. Note your sync code first if you want to reconnect.",
      )
    )
      return;
    setShown(false);
    sync.disable();
  };

  const deleteServerCopy = async () => {
    if (
      !confirm(
        "Delete the server copy? Every device using this sync code stops syncing. Characters already in each browser stay there.",
      )
    )
      return;
    try {
      await sync.destroy();
      setShown(false);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : String(err), warn: false });
    }
  };

  const status = on ? st.status : "off";
  const badge = on ? sync.BADGES[st.status] || "On" : "Off";
  const when = st.updated ? " Last saved to the server " + new Date(st.updated).toLocaleString() + "." : "";
  const message = error
    ? error.text
    : on
      ? st.message || "Your characters and dockets are saved on the server." + when
      : st.message || "";
  const warn = error ? error.warn : /error|conflict|offline/.test(st.status);

  return (
    <section className="sync-panel" id="sync-panel" aria-labelledby="sync-title">
      <div className="sync-head">
        <h3 id="sync-title">Sync across devices</h3>
        <span className={"sync-badge " + status} id="sync-badge">
          {badge}
        </span>
      </div>
      {!on ? (
        <div id="sync-off">
          <p className="small">{S_SYNC_OFF}</p>
          <div className="row">
            <button className="btn primary" id="sync-enable" type="button" onClick={turnOn} disabled={busy}>
              Turn on sync
            </button>
          </div>
          <form className="row sync-link" id="sync-link" onSubmit={submitCode}>
            <input
              type="text"
              id="sync-code-input"
              placeholder="Already have a code? JSA-XXXX-XXXX-XXXX-XXXX-XXXX"
              aria-label="Sync code"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button className="btn" type="submit">
              Use code
            </button>
          </form>
        </div>
      ) : (
        <div id="sync-on">
          <p className="small">
            {S_SYNC_ON_PARTS[0]}
            <strong>{S_SYNC_ON_PARTS[1]}</strong>
            {S_SYNC_ON_PARTS[2]}
          </p>
          <div className="row sync-code-row">
            <code className="sync-code" id="sync-code">
              {shown ? code : masked(code)}
            </code>
            <button
              className="mini"
              id="sync-reveal"
              type="button"
              aria-pressed={shown}
              onClick={() => setShown((s) => !s)}
            >
              {shown ? "Hide" : "Show"}
            </button>
            <button className="mini" id="sync-copy" type="button" onClick={copyCode}>
              {copyLabel}
            </button>
          </div>
          <div className="row">
            <button className="mini" id="sync-now" type="button" onClick={() => void sync.pull(true)}>
              Sync now
            </button>
            <button className="mini" id="sync-off-btn" type="button" onClick={stop}>
              Stop syncing on this device
            </button>
            <button className="mini danger-quiet" id="sync-delete" type="button" onClick={deleteServerCopy}>
              Delete server copy
            </button>
          </div>
        </div>
      )}
      <p className={"small sync-message" + (warn ? " warn" : "")} id="sync-message" role="status" aria-live="polite">
        {message}
      </p>
      {st.lost + st.lostCases > 0 && (
        <div className="row sync-lost" id="sync-lost">
          <span className="small warn">
            {st.lost + st.lostCases === 1
              ? "Your version of " + S_LOST_ITEMS(st.lost, st.lostCases) + " was replaced by another device's."
              : "Your versions of " + S_LOST_ITEMS(st.lost, st.lostCases) + " were replaced by another device's."}
          </span>
          <button className="mini" id="sync-restore" type="button" onClick={() => sync.restoreLost()}>
            Restore my version
          </button>
          <button
            className="mini"
            id="sync-discard"
            type="button"
            onClick={() => {
              if (confirm("Throw away your kept version? The other device's version stays. This cannot be undone."))
                sync.discardLost();
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
