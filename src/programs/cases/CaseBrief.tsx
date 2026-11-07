// Copy brief (LP-228): where a case stands, as one Discord message for the firm channel.
// Billing is left out unless "Include billing" is ticked.

import { useState } from "react";
import { caseBrief } from "@/lib/caseBrief";
import { copyText } from "@/lib/clipboard";
import { gameToday } from "@/lib/deadlines";
import { caseBilling, invoiceStore } from "@/lib/invoices";
import { rateLookup, timeStore } from "@/lib/ledger";
import type { Case, Character } from "@/lib/types";

export default function CaseBrief({ c, characters }: { c: Case; characters: Character[] }) {
  const [billing, setBilling] = useState(false);
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);

  const copy = async () => {
    const names = new Map(characters.map((ch) => [ch.id, ch.name]));
    const text = caseBrief(c, {
      nameOf: (id) => (id && names.get(id)) || "",
      today: gameToday(),
      billing: billing
        ? caseBilling(c.id, timeStore().list(), invoiceStore().list(), rateLookup([c], characters))
        : null,
    });
    const ok = await copyText(text);
    setStatus({ text: ok ? "Copied. Paste it in Discord." : "Copy failed.", bad: !ok });
  };

  return (
    <div className="row case-brief">
      <button type="button" className="btn" id="case-brief-copy" onClick={() => void copy()}>
        Copy brief
      </button>
      <label className="field check">
        <input
          type="checkbox"
          id="case-brief-billing"
          checked={billing}
          onChange={(e) => setBilling(e.target.checked)}
        />
        <span className="small">Include billing</span>
      </label>
      <span className={"small" + (status?.bad ? " bad" : " good")} role="status" id="case-brief-status">
        {status?.text || ""}
      </span>
    </div>
  );
}
