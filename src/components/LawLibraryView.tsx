// The Law Library program at #library, with two tabs. Penal Code (LP-17): the
// server's charges, searched and cited (PenalCodeSearch). Precedents (LP-16):
// the firm's own rulings, added and edited here, searched by keyword, case
// number, judge or court (matches highlighted) and filtered by topic tag. Both
// searches are also the Law Library dialog in a form, where Insert citation
// puts the reference into the form field last clicked in.

import { useMemo, useState, type FormEvent } from "react";
import { copyText } from "@/lib/clipboard";
import { formatDay } from "@/lib/deadlines";
import { safeLink } from "@/lib/exhibits";
import {
  allTags,
  citation,
  COURT_SUGGESTIONS,
  filterPrecedents,
  precedentStore,
  searchTerms,
  type Precedent,
} from "@/lib/precedents";
import Marked from "./Marked";
import PenalCodeSearch from "./PenalCodeSearch";
import { usePrecedentVersion } from "./useStore";

export type LibraryTab = "code" | "precedents";

/** The Penal Code / Precedents switch. */
export function LibraryTabs({
  tab,
  onTab,
  idPrefix,
}: {
  tab: LibraryTab;
  onTab(t: LibraryTab): void;
  idPrefix: string;
}) {
  const tabs: Array<[LibraryTab, string]> = [
    ["code", "Penal Code"],
    ["precedents", "Precedents"],
  ];
  return (
    <div className="row library-tabs" role="tablist" aria-label="Law Library">
      {tabs.map(([t, label]) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={idPrefix + "-tab-" + t}
          className={"btn" + (tab === t ? " primary" : "")}
          aria-selected={tab === t}
          onClick={() => onTab(t)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export interface PrecedentSearchProps {
  /** Put the citation into the form (the dialog); absent on the library page. */
  onInsert?(p: Precedent): void;
  /** Why Insert citation is off, when it is (no field picked yet). */
  insertOff?: string;
  onEdit?(p: Precedent): void;
  /** Ids prefix, so the page and the dialog don't clash. */
  idPrefix: string;
}

/** The search box, the tag filter and the matching rulings. */
export function PrecedentSearch({ onInsert, insertOff, onEdit, idPrefix }: PrecedentSearchProps) {
  const version = usePrecedentVersion();
  const all = useMemo(() => (version >= 0 ? precedentStore().list() : []), [version]);
  const tags = useMemo(() => allTags(all), [all]);
  const [q, setQ] = useState("");
  const [tagPicked, setTag] = useState("");
  const tag = tags.includes(tagPicked) ? tagPicked : "";
  const terms = useMemo(() => searchTerms(q), [q]);
  const shown = useMemo(() => filterPrecedents(all, { q, tag }), [all, q, tag]);
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);

  const copy = async (p: Precedent) => {
    const ok = await copyText(citation(p));
    setStatus(ok ? { text: "Copied: " + citation(p), bad: false } : { text: "Copy failed: try again.", bad: true });
  };

  const remove = (p: Precedent) => {
    if (!confirm("Delete " + p.caseName + " from the library?")) return;
    precedentStore().remove(p.id);
  };

  if (!all.length) {
    return (
      <p className="small muted" id={idPrefix + "-empty"}>
        No rulings in the library yet. Add the firm&apos;s rulings in the Law Library to search and cite them.
      </p>
    );
  }

  return (
    <div className="precedent-search">
      <div className="row precedent-filters">
        <input
          type="search"
          id={idPrefix + "-q"}
          placeholder="Search: keyword, case number, judge or court"
          aria-label="Search precedents"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          id={idPrefix + "-tag"}
          aria-label="Topic"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          disabled={!tags.length}
        >
          <option value="">All topics</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted" id={idPrefix + "-count"}>
        {shown.length === all.length
          ? all.length + (all.length === 1 ? " ruling" : " rulings")
          : shown.length + " of " + all.length + " rulings"}
      </p>
      {shown.length ? (
        <ul className="precedent-list" id={idPrefix + "-list"}>
          {shown.map((p) => {
            const link = safeLink(p.link);
            const meta = [p.caseNumber, p.court, p.date ? formatDay(p.date) : "", p.judge ? "Judge " + p.judge : ""]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={p.id} className="precedent">
                <div className="precedent-head">
                  <strong className="precedent-name">
                    <Marked text={p.caseName} terms={terms} />
                  </strong>
                  <span className="precedent-actions">
                    {onInsert && (
                      <button
                        type="button"
                        className="mini"
                        disabled={!!insertOff}
                        title={insertOff || "Insert " + citation(p)}
                        onClick={() => onInsert(p)}
                      >
                        Insert citation
                      </button>
                    )}
                    <button type="button" className="mini" onClick={() => void copy(p)}>
                      Copy citation
                    </button>
                    {onEdit && (
                      <>
                        <button type="button" className="mini" onClick={() => onEdit(p)}>
                          Edit
                        </button>
                        <button type="button" className="mini danger-quiet" onClick={() => remove(p)}>
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {meta && (
                  <p className="small muted precedent-meta">
                    <Marked text={meta} terms={terms} />
                  </p>
                )}
                {p.holding && (
                  <p className="precedent-holding">
                    <strong>Held: </strong>
                    <Marked text={p.holding} terms={terms} />
                  </p>
                )}
                {p.summary && (
                  <p className="small precedent-summary">
                    <Marked text={p.summary} terms={terms} />
                  </p>
                )}
                {(p.tags.length > 0 || link) && (
                  <p className="small precedent-foot">
                    {p.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={"tag precedent-tag" + (t === tag ? " on" : "")}
                        title={"Show only " + t}
                        onClick={() => setTag(t === tag ? "" : t)}
                      >
                        <Marked text={t} terms={terms} />
                      </button>
                    ))}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer nofollow">
                        Forum thread
                      </a>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted" id={idPrefix + "-none"}>
          No rulings match. Try fewer words or another topic.
        </p>
      )}
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status">
        {status?.text || ""}
      </p>
    </div>
  );
}

interface Draft {
  caseName: string;
  caseNumber: string;
  court: string;
  date: string;
  judge: string;
  summary: string;
  holding: string;
  link: string;
  tags: string;
}

const EMPTY: Draft = {
  caseName: "",
  caseNumber: "",
  court: "",
  date: "",
  judge: "",
  summary: "",
  holding: "",
  link: "",
  tags: "",
};

const draftOf = (p: Precedent): Draft => ({
  caseName: p.caseName,
  caseNumber: p.caseNumber || "",
  court: p.court || "",
  date: p.date || "",
  judge: p.judge || "",
  summary: p.summary || "",
  holding: p.holding || "",
  link: p.link || "",
  tags: p.tags.join(", "),
});

/** Add or edit one ruling. */
function PrecedentForm({ editing, onDone }: { editing: Precedent | null; onDone(): void }) {
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftOf(editing) : EMPTY));
  const [error, setError] = useState("");
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!draft.caseName.trim()) {
      setError("Give the ruling a case name, e.g. Smith v. Jones.");
      return;
    }
    if (draft.link.trim() && !safeLink(draft.link)) {
      setError("The forum link must start with http:// or https://.");
      return;
    }
    try {
      precedentStore().save({ ...(editing ? { id: editing.id } : {}), ...draft, tags: draft.tags.split(",") });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="case-form precedent-form" id="precedent-form" noValidate onSubmit={submit}>
      <h4>{editing ? "Edit ruling" : "Add a ruling"}</h4>
      <div className="case-fields">
        <div className="field">
          <label htmlFor="precedent-name">Case name</label>
          <input id="precedent-name" placeholder="Smith v. Jones" value={draft.caseName} onChange={set("caseName")} />
        </div>
        <div className="field">
          <label htmlFor="precedent-number">Case number</label>
          <input
            id="precedent-number"
            placeholder="90SCCV00123"
            value={draft.caseNumber}
            onChange={set("caseNumber")}
          />
        </div>
        <div className="field">
          <label htmlFor="precedent-court">Court</label>
          <input id="precedent-court" list="precedent-courts" value={draft.court} onChange={set("court")} />
          <datalist id="precedent-courts">
            {COURT_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="precedent-date">Date of ruling (in-game)</label>
          <input id="precedent-date" type="date" value={draft.date} onChange={set("date")} />
        </div>
        <div className="field">
          <label htmlFor="precedent-judge">Judge</label>
          <input id="precedent-judge" value={draft.judge} onChange={set("judge")} />
        </div>
        <div className="field">
          <label htmlFor="precedent-link">Forum thread</label>
          <input id="precedent-link" type="url" placeholder="https://…" value={draft.link} onChange={set("link")} />
        </div>
      </div>
      <div className="field wide">
        <label htmlFor="precedent-holding">Key holding</label>
        <textarea
          id="precedent-holding"
          rows={2}
          placeholder="What the court decided, in a sentence or two."
          value={draft.holding}
          onChange={set("holding")}
        />
      </div>
      <div className="field wide">
        <label htmlFor="precedent-summary">Summary</label>
        <textarea id="precedent-summary" rows={4} value={draft.summary} onChange={set("summary")} />
      </div>
      <div className="field wide">
        <label htmlFor="precedent-tags">Topics</label>
        <input
          id="precedent-tags"
          placeholder="search and seizure, contracts"
          value={draft.tags}
          onChange={set("tags")}
        />
        <p className="help">Separate topics with commas.</p>
      </div>
      <p className="error" role="alert" id="precedent-error">
        {error}
      </p>
      <div className="row">
        <button type="submit" className="btn primary" id="precedent-save">
          {editing ? "Save ruling" : "Add ruling"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const TAB_HASH: Record<LibraryTab, string> = { code: "#library/penal-code", precedents: "#library/precedents" };

/** The Law Library program's page; `tab` comes from the route (#library/penal-code, #library/precedents). */
export default function LawLibraryView({ tab: routeTab = "code" }: { tab?: LibraryTab }) {
  /** The ruling being edited, "new" for the add form, or null. */
  const [editing, setEditing] = useState<Precedent | "new" | null>(null);
  // The tab switches at once, and the URL follows (back and forward come in through the route).
  const [tab, setTab] = useState<LibraryTab>(routeTab);
  const [seenTab, setSeenTab] = useState(routeTab);
  if (routeTab !== seenTab) {
    setSeenTab(routeTab);
    setTab(routeTab);
  }
  const pickTab = (t: LibraryTab) => {
    setTab(t);
    if (location.hash !== TAB_HASH[t]) location.hash = TAB_HASH[t];
  };

  return (
    <section id="library" className="form-view library">
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="library-title">Law Library</h2>
        </div>
      </div>
      <LibraryTabs tab={tab} onTab={pickTab} idPrefix="library" />
      {tab === "code" ? (
        <section aria-labelledby="code-title" className="penal-code-section">
          <h3 id="code-title">Penal Code</h3>
          <PenalCodeSearch idPrefix="code" />
        </section>
      ) : (
        <section aria-labelledby="precedents-title" className="precedents">
          <div className="row precedents-head">
            <h3 id="precedents-title">Precedents</h3>
            {!editing && (
              <button type="button" className="btn" id="precedent-new" onClick={() => setEditing("new")}>
                Add ruling
              </button>
            )}
          </div>
          <p className="small muted">
            Rulings the firm has been involved in. Search them here, or open the Law Library from a form to insert a
            citation.
          </p>
          {editing && (
            <PrecedentForm
              key={editing === "new" ? "new" : editing.id}
              editing={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
          <PrecedentSearch idPrefix="precedents" onEdit={(p) => setEditing(p)} />
        </section>
      )}
    </section>
  );
}
