// The forum preview window (FR7, INV §a aside#output): Preview/BBCode/Discord tabs,
// Highlight unfilled, Copy for forum, Copy BBCode and Download .docx.

import { useEffect, useMemo, useRef, useState } from "react";
import { fromHtml } from "@/lib/bbcode";
import { copyRich, copyText } from "@/lib/clipboard";
import type { FormDef } from "@/lib/types";
import DiscordPanel from "./DiscordPanel";

export interface OutputPaneProps {
  form: Pick<FormDef, "id" | "title">;
  finalHtml: string;
  previewHtml: string;
  highlight: boolean;
  onHighlight(on: boolean): void;
}

type Tab = "preview" | "bbcode" | "discord";

const TABS: Tab[] = ["preview", "bbcode", "discord"];
const PANEL_ID: Record<Tab, string> = { preview: "preview", bbcode: "bbcode-pane", discord: "discord-pane" };

export default function OutputPane({ form, finalHtml, previewHtml, highlight, onHighlight }: OutputPaneProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [building, setBuilding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  };

  const copyBBCode = async () => {
    const ok = await copyText(bbcode || fromHtml(finalHtml));
    flash(ok ? "BBCode copied." : "Copy failed: select the text and press Ctrl+C.", !ok);
  };

  const downloadDocx = async () => {
    setBuilding(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: finalHtml, title: form.title, id: form.id }),
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
    } catch {
      flash("Couldn't build the .docx (server unreachable).", true);
    } finally {
      setBuilding(false);
    }
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
            <button type="button" className="btn primary" id="copy-rich" onClick={copyForum}>
              Copy for forum
            </button>
            <button type="button" className="btn" id="copy-bbcode" onClick={copyBBCode}>
              Copy BBCode
            </button>
            <button type="button" className="btn" id="download-docx" onClick={downloadDocx} disabled={building}>
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
            <DiscordPanel finalHtml={finalHtml} onStatus={flash} />
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
      <div className="status-bar">
        <span
          className={"status" + (status ? (status.bad ? " bad" : " good") : "")}
          id="copy-status"
          role="status"
          aria-live="polite"
        >
          {status ? status.text : ""}
        </span>
      </div>
    </aside>
  );
}
