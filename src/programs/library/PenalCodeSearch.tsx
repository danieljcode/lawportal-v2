// The penal code in the Law Library (LP-17): search by section number, keyword
// or title (matches highlighted), filter by chapter and class, and Copy or
// Insert citation ("PC 1001 Assault"). Shows when the code was last updated.

import { useMemo, useState } from "react";
import { copyText } from "@/lib/clipboard";
import {
  chapters,
  CHARGE_CLASSES,
  sortCharges,
  type ChargeSort,
  chargeCitation,
  fineText,
  PENAL_CODE,
  searchCharges,
  sentenceText,
  type Charge,
  type PenalCode,
} from "@/lib/penalCode";
import { searchTerms } from "@/lib/precedents";
import Marked from "@/ui/Marked";

/** How many results show before "Show more". */
export const PAGE = 40;

const STATUS_TAGS: Partial<Record<Charge["status"], string>> = {
  new: "New",
  amended: "Amended",
  review: "Under review",
  retired: "Retired",
};

/** "20 Oct 2026" for 2026-10-20 (a real date: when the data was updated). */
function realDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface PenalCodeSearchProps {
  /** Put the citation into the form (the dialog); absent on the library page. */
  onInsert?(c: Charge): void;
  /** Why Insert citation is off, when it is. */
  insertOff?: string;
  /** Ids prefix, so the page and the dialog don't clash. */
  idPrefix: string;
  /** The code to show (tests); the app's data file by default. */
  code?: PenalCode;
  /** The chapter shown, when the Law Library program's route holds it (LP-108); "" for all. */
  chapter?: string;
  /** Pick a chapter (the program changes its address); without it the chapter list is local. */
  onChapter?(chapter: string): void;
}

export default function PenalCodeSearch({
  onInsert,
  insertOff,
  idPrefix,
  code = PENAL_CODE,
  chapter: routeChapter,
  onChapter,
}: PenalCodeSearchProps) {
  const [q, setQ] = useState("");
  const [localChapter, setLocalChapter] = useState("");
  const chapter = onChapter ? routeChapter || "" : localChapter;
  const setChapter = onChapter || setLocalChapter;
  const [sort, setSort] = useState<ChargeSort>("section");
  const [cls, setCls] = useState("");
  const [retired, setRetired] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const terms = useMemo(() => searchTerms(q).filter((t) => t !== "pc"), [q]);
  // A search ranks its matches; browsing follows the chosen order (LP-108).
  const shown = useMemo(() => {
    const found = searchCharges(code.charges, { q, chapter, class: cls, retired });
    return q.trim() ? found : sortCharges(found, sort);
  }, [code, q, chapter, cls, retired, sort]);
  const chapterList = useMemo(() => chapters(code), [code]);

  // A new search starts from the top of the results.
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setLimit(PAGE);
    };

  const copy = async (c: Charge) => {
    const ok = await copyText(chargeCitation(c));
    setStatus(
      ok ? { text: "Copied: " + chargeCitation(c), bad: false } : { text: "Copy failed: try again.", bad: true },
    );
  };

  return (
    <div className="penal-code">
      <p className="small muted penal-code-source" id={idPrefix + "-source"}>
        {code.title + ", last updated " + realDay(code.updated) + "."}
        {code.note && " " + code.note}
      </p>
      <div className="row precedent-filters">
        <input
          type="search"
          id={idPrefix + "-q"}
          placeholder="Search: section number, keyword or title"
          aria-label="Search the penal code"
          value={q}
          onChange={(e) => filter(setQ)(e.target.value)}
        />
        <select
          id={idPrefix + "-chapter"}
          aria-label="Chapter"
          value={chapter}
          onChange={(e) => filter(setChapter)(e.target.value)}
        >
          <option value="">All chapters</option>
          {chapterList.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          id={idPrefix + "-class"}
          aria-label="Class"
          value={cls}
          onChange={(e) => filter(setCls)(e.target.value)}
        >
          <option value="">All classes</option>
          {CHARGE_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          id={idPrefix + "-sort"}
          aria-label="Order"
          value={sort}
          disabled={!!q.trim()}
          title={q.trim() ? "Search results are in order of how well they match" : undefined}
          onChange={(e) => filter(setSort)(e.target.value as ChargeSort)}
        >
          <option value="section">Section order</option>
          <option value="title">Title, A to Z</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            id={idPrefix + "-retired"}
            checked={retired}
            onChange={(e) => filter(setRetired)(e.target.checked)}
          />
          <span>Show retired</span>
        </label>
      </div>
      <p className="small muted" id={idPrefix + "-count"}>
        {shown.length + (shown.length === 1 ? " charge" : " charges")}
      </p>
      {shown.length ? (
        <ul className="precedent-list charge-list" id={idPrefix + "-list"}>
          {shown.slice(0, limit).map((c) => {
            const fine = fineText(c);
            const tag = STATUS_TAGS[c.status];
            return (
              <li key={c.section} className={"precedent charge" + (c.status === "retired" ? " retired" : "")}>
                <div className="precedent-head">
                  <strong className="charge-name">
                    <Marked text={c.section} terms={terms} />
                    {" · "}
                    <Marked text={c.title} terms={terms} />
                  </strong>
                  <span className="precedent-actions">
                    {onInsert && (
                      <button
                        type="button"
                        className="mini"
                        disabled={!!insertOff}
                        title={insertOff || "Insert " + chargeCitation(c)}
                        onClick={() => onInsert(c)}
                      >
                        Insert citation
                      </button>
                    )}
                    <button type="button" className="mini" onClick={() => void copy(c)}>
                      Copy citation
                    </button>
                  </span>
                </div>
                <p className="small precedent-meta">
                  <span className={"tag charge-class " + c.class.toLowerCase()}>{c.class}</span>{" "}
                  {tag && <span className="tag charge-status">{tag}</span>} <span className="muted">{c.chapter}</span>
                </p>
                <p className="charge-sentence">
                  <strong>Sentence: </strong>
                  {sentenceText(c)}
                  {fine && " · Fine " + fine}
                  {c.penalties && " · " + c.penalties}
                </p>
                <p className="small">
                  <Marked text={c.description} terms={terms} />
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted" id={idPrefix + "-none"}>
          No charges match. Try fewer words, another chapter or class, or Show retired.
        </p>
      )}
      {shown.length > limit && (
        <button type="button" className="btn" id={idPrefix + "-more"} onClick={() => setLimit(limit + PAGE)}>
          {"Show more (" + (shown.length - limit) + " left)"}
        </button>
      )}
      <p className={"small" + (status?.bad ? " bad" : " good")} role="status">
        {status?.text || ""}
      </p>
    </div>
  );
}
