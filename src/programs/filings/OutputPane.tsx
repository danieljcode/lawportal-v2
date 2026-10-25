// The forum preview window (FR7, INV §a aside#output): Preview/BBCode/Discord tabs,
// Highlight unfilled, Copy for forum, Copy BBCode and Download .docx.

import { useEffect, useMemo, useRef, useState } from "react";
import { fromHtml } from "@/lib/bbcode";
import { copyRich, copyText } from "@/lib/clipboard";
import { docxRequestBody } from "@/lib/docx/request";
import type { FilingVia } from "@/lib/filings";
import type { MissingField } from "@/lib/formState";
import type { SafeHtml } from "@/lib/safeHtml";
import type { FormDef } from "@/lib/types";
import Dialog from "@/ui/Dialog";
import DiscordPanel from "./DiscordPanel";

export interface OutputPaneProps {
  form: Pick<FormDef, "id" | "title">;
  /** Only rendered HTML can be shown, copied or sent for the .docx (LP-5). */
  finalHtml: SafeHtml;
  previewHtml: SafeHtml;
  highlight: boolean;
  onHighlight(on: boolean): void;
  /** Required fields still empty: copying or downloading asks first (LP-87). */
  missing?: MissingField[];
  /** Take the user to one of them in the form. */
  onJump?(m: MissingField): void;
  /** A copy or download went through (filing history, LP-15). */
  onFiled?(via: FilingVia): void;
  /** Open Filing history. */
  onOpenHistory?(): void;
}

type Tab = "preview" | "bbcode" | "discord";

const TABS: Tab[] = ["preview", "bbcode", "discord"];
const PANEL_ID: Record<Tab, string> = { preview: "preview", bbcode: "bbcode-pane", discord: "discord-pane" };

export default function OutputPane({
  form,
  finalHtml,
  previewHtml,
  highlight,
  onHighlight,
  missing = [],
  onJump,
  onFiled,
  onOpenHistory,
}: OutputPaneProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [building, setBuilding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A copy or download waiting on the missing-fields dialog: "Copy anyway" runs it. */
  const [pending, setPending] = useState<{ what: string; run: () => void } | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ preview: null, bbcode: null, discord: null });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // BBCode is only computed while its tab is visible (and on copy).
  const bbcode = useMemo(() => (tab === "bbcode" ? fromHtml(finalHtml) : ""), [tab, finalHtml]);

  const flash = (text: string, bad = false) => {
    setStatus({ text, bad });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 4000);
  };

  const copyForum = async () => {
    const ok = await copyRich(finalHtml, fromHtml(finalHtml));
    flash(ok ? "Copied. Paste it into the forum editor." : "Copy failed: select the preview and press Ctrl+C.", !ok);
    if (ok) onFiled?.("forum");
  };

  const copyBBCode = async () => {
    const ok = await copyText(bbcode || fromHtml(finalHtml));
    flash(ok ? "BBCode copied." : "Copy failed: select the text and press Ctrl+C.", !ok);
    if (ok) onFiled?.("bbcode");
  };

  const downloadDocx = async () => {
    setBuilding(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: docxRequestBody(finalHtml, form.title, form.id),
        });
      } catch {
        flash("Couldn't build the .docx (server unreachable).", true);
        return;
      }
      if (!res.ok) {
        flash("Couldn't build the .docx (" + res.status + ").", true);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = form.id + ".docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      onFiled?.("docx");
    } catch {
      flash("Couldn't build the .docx (server unreachable).", true);
    } finally {
      setBuilding(false);
    }
  };

  // Every copy and download checks the required fields first (LP-87).
  const guard = (what: string, run: () => void) => {
    if (missing.length) setPending({ what, run });
    else run();
  };

  const runAnyway = () => {
    const p = pending;
    setPending(null);
    p?.run();
  };

  const jump = (m: MissingField) => {
    setPending(null);
    // After the dialog has closed, so the field can take focus.
    setTimeout(() => onJump?.(m), 0);
  };

  // Arrow keys move between the tabs, wrapping; Home/End jump to the ends (ARIA tabs pattern).
  const onTabKey = (e: React.KeyboardEvent) => {
    const at = TABS.indexOf(tab);
    let next: Tab;
    if (e.key === "ArrowRight") next = TABS[(at + 1) % TABS.length];
    else if (e.key === "ArrowLeft") next = TABS[(at + TABS.length - 1) % TABS.length];
    else if (e.key === "Home") next = TABS[0];
    else if (e.key === "End") next = TABS[TABS.length - 1];
    else return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const tabButton = (which: Tab, label: string) => (
    <button
      ref={(el) => {
        tabRefs.current[which] = el;
      }}
      type="button"
      role="tab"
      className="tab"
      id={"tab-" + which}
      aria-selected={tab === which}
      aria-controls={PANEL_ID[which]}
      tabIndex={tab === which ? 0 : -1}
      onClick={() => setTab(which)}
      onKeyDown={onTabKey}
    >
      {label}
    </button>
  );

  return (
    <aside className="output window" id="output" aria-labelledby="output-title">
      <div className="title-bar">
        <span className="title-bar-text" id="output-title">
          Forum preview
        </span>
      </div>
      <div className="window-body output-body">
        <div className="output-bar">
          <div className="tabs" role="tablist" aria-label="Output">
            {tabButton("preview", "Preview")}
            {tabButton("bbcode", "BBCode")}
            {tabButton("discord", "Discord")}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              className="win-check"
              id="highlight"
              checked={highlight}
              onChange={(e) => onHighlight(e.target.checked)}
            />{" "}
            Highlight unfilled
          </label>
        </div>
        <div className="tab-panel">
          <div className="copy-row">
            <button type="button" className="btn primary" id="copy-rich" onClick={() => guard("Copy", copyForum)}>
              Copy for forum
            </button>
            <button type="button" className="btn" id="copy-bbcode" onClick={() => guard("Copy", copyBBCode)}>
              Copy BBCode
            </button>
            <button
              type="button"
              className="btn"
              id="download-docx"
              onClick={() => guard("Download", downloadDocx)}
              disabled={building}
            >
              Download .docx
            </button>
          </div>
          {tab === "preview" ? (
            <div className="post-frame">
              <div
                className="preview post"
                id="preview"
                role="tabpanel"
                aria-labelledby="tab-preview"
                // Engine output only: every user value is escaped (design §Invariants).
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          ) : tab === "discord" ? (
            <DiscordPanel finalHtml={finalHtml} onStatus={flash} guard={guard} onCopied={() => onFiled?.("discord")} />
          ) : (
            <div id="bbcode-pane" role="tabpanel" aria-labelledby="tab-bbcode">
              <p className="note">
                Invision has no table BBCode, so table layouts are flattened here. Use <strong>Copy for forum</strong>{" "}
                to keep them.
              </p>
              <textarea
                id="bbcode"
                className="code-area"
                readOnly
                spellCheck={false}
                value={bbcode}
                aria-label="BBCode"
              />
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        id="missing-dialog"
        titleId="missing-title"
        title="Some required fields are empty"
      >
        <p>
          {(missing.length === 1 ? "This field is" : "These fields are") +
            " still empty. Fill " +
            (missing.length === 1 ? "it" : "them") +
            " in before posting, or " +
            (pending?.what || "Copy").toLowerCase() +
            " anyway."}
        </p>
        <ul id="missing-list">
          {missing.map((m, i) => (
            <li key={m.key + i}>
              <a
                href={"#filings/" + form.id}
                onClick={(e) => {
                  e.preventDefault();
                  jump(m);
                }}
              >
                {m.label}
              </a>
              {m.where && <span className="muted">{" (" + m.where + ")"}</span>}
            </li>
          ))}
        </ul>
        <div className="row dialog-actions">
          <button type="button" className="btn primary" id="missing-back" onClick={() => setPending(null)} autoFocus>
            Go back
          </button>
          <button type="button" className="btn" id="missing-anyway" onClick={runAnyway}>
            {(pending?.what || "Copy") + " anyway"}
          </button>
        </div>
      </Dialog>
      <div className="status-bar">
        <span
          className={"status" + (status ? (status.bad ? " bad" : " good") : "")}
          id="copy-status"
          role="status"
          aria-live="polite"
        >
          {status ? status.text : ""}
        </span>
        {onOpenHistory && (
          <button type="button" className="mini" id="open-filings" onClick={onOpenHistory}>
            Filing history
          </button>
        )}
      </div>
    </aside>
  );
}
