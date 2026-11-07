// A case's timeline (LP-219): its filings, notes, deadlines, actions done, evidence, time and
// invoices in date order, newest first, grouped by game day. Read-only; each entry goes to where it lives.

import { useMemo, useState } from "react";
import { formatDay } from "@/lib/deadlines";
import { invoiceStore } from "@/lib/invoices";
import { timeStore } from "@/lib/ledger";
import {
  byDay,
  caseTimeline,
  KIND_LABELS,
  TIMELINE_KINDS,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/timeline";
import type { Filing } from "@/lib/filings";
import type { Case, Character } from "@/lib/types";
import { useInvoiceVersion, useTimeVersion } from "@/ui/useStore";

/** Entries shown before "Show all". */
export const TIMELINE_PAGE = 50;

/** Scroll to a section of the case view and move focus there. */
function goTo(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.scrollIntoView?.({ block: "start" });
  el.focus({ preventScroll: true });
}

function Entry({ e }: { e: TimelineEvent }) {
  const body = (
    <>
      {e.time && <span className="small muted">{e.time} · </span>}
      <span className="small muted">{KIND_LABELS[e.kind]}</span>
      <strong className="case-timeline-title">{e.title}</strong>
      {e.detail && <span className="small case-timeline-detail">{e.detail}</span>}
    </>
  );
  return (
    <li className="case-timeline-entry" data-kind={e.kind}>
      {e.target.startsWith("#") ? (
        <a href={e.target}>{body}</a>
      ) : (
        <button type="button" onClick={() => goTo(e.target)}>
          {body}
        </button>
      )}
    </li>
  );
}

export default function CaseTimeline({
  c,
  filings,
  characters,
}: {
  c: Case;
  filings: Filing[];
  characters: Character[];
}) {
  const timeVersion = useTimeVersion();
  const invoiceVersion = useInvoiceVersion();
  const [kind, setKind] = useState<TimelineKind | "">("");
  const [all, setAll] = useState(false);
  const events = useMemo(() => {
    const names = new Map(characters.map((ch) => [ch.id, ch.name]));
    return caseTimeline(c, {
      filings,
      time: timeVersion >= 0 ? timeStore().list() : [],
      invoices: invoiceVersion >= 0 ? invoiceStore().list() : [],
      nameOf: (id) => (id && names.get(id)) || "",
    });
  }, [c, filings, characters, timeVersion, invoiceVersion]);

  if (!events.length) {
    return (
      <p className="small muted" id="timeline-none">
        Nothing on this case yet. Notes, filings, deadlines, evidence, time and invoices will show here in date order.
      </p>
    );
  }
  const shown = kind ? events.filter((e) => e.kind === kind) : events;
  const page = all ? shown : shown.slice(0, TIMELINE_PAGE);
  return (
    <>
      <label className="field case-timeline-filter">
        <span className="small">Show</span>
        <select id="timeline-filter" value={kind} onChange={(e) => setKind(e.target.value as TimelineKind | "")}>
          <option value="">Everything</option>
          {TIMELINE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {page.length ? (
        <ol className="case-timeline" id="timeline-list">
          {byDay(page).map(([date, list]) => (
            <li key={date || "undated"} className="case-timeline-day">
              <h5>{date ? formatDay(date) : "No date"}</h5>
              <ul>
                {list.map((e) => (
                  <Entry key={e.key} e={e} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="small muted" id="timeline-none-shown">
          Nothing of that type on this case.
        </p>
      )}
      {page.length < shown.length && (
        <button type="button" className="btn" id="timeline-more" onClick={() => setAll(true)}>
          Show all {shown.length}
        </button>
      )}
    </>
  );
}
