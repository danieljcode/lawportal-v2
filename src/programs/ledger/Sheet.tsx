// A Ledger sheet (an invoice, a top-up letter): the page as paper, with Print,
// Copy for forum, Copy for Discord and Download .docx, all from the one render.

import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { fromHtml } from "@/lib/bbcode";
import { copyRich, copyText } from "@/lib/clipboard";
import { toDiscord } from "@/lib/discord";
import { docxRequestBody } from "@/lib/docx/request";
import { download } from "@/lib/download";
import type { SafeHtml } from "@/lib/safeHtml";

export default function Sheet({
  html,
  title,
  filename,
  prefix,
  children,
}: {
  html: SafeHtml;
  /** The .docx's title. */
  title: string;
  /** The .docx's name, without ".docx". */
  filename: string;
  /** Prefix for the buttons' ids ("invoice" → #invoice-print). */
  prefix: string;
  /** More buttons after the outputs (Delete, Close). */
  children?: ReactNode;
}) {
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [printing, setPrinting] = useState(false);
  const say = (text: string, bad = false) => setStatus({ text, bad });

  // The id exists only while the print dialog is open, so printing shows just this sheet.
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  };

  const docx = async () => {
    try {
      const res = await fetch("/api/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: docxRequestBody(html, title, ""),
      });
      if (!res.ok) return say("Couldn't build the .docx (" + res.status + ").", true);
      download(await res.blob(), filename + ".docx");
    } catch {
      say("Couldn't build the .docx (server unreachable).", true);
    }
  };

  return (
    <>
      <div className="row invoice-actions">
        <button type="button" className="btn" id={prefix + "-print"} onClick={print}>
          Print
        </button>
        <button
          type="button"
          className="btn"
          id={prefix + "-copy"}
          onClick={async () => {
            const ok = await copyRich(html, fromHtml(html));
            say(ok ? "Copied. Paste it into the forum editor." : "Copy failed.", !ok);
          }}
        >
          Copy for forum
        </button>
        <button
          type="button"
          className="btn"
          id={prefix + "-discord"}
          onClick={async () => {
            const ok = await copyText(toDiscord(html));
            say(ok ? "Copied for Discord." : "Copy failed.", !ok);
          }}
        >
          Copy for Discord
        </button>
        <button type="button" className="btn" id={prefix + "-docx"} onClick={() => void docx()}>
          Download .docx
        </button>
        {children}
      </div>
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status" id={prefix + "-status"}>
        {status?.text || ""}
      </p>
      <div
        className="invoice-sheet"
        id={printing ? "invoice-print-sheet" : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
