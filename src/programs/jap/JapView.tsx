// The Judicial Advancement Portfolio view (#jap; FR12, INV §a #jap-view, §e.3).
//
// Only for an active "Court Commissioner I/II" character; anyone else sees the
// gate note. The work on screen pads each required task to its count with
// empty rows (padding isn't saved); every edit is saved straight away through
// the portfolio store, which drops empty rows and cleans the rest.

import { useEffect, useMemo, useRef, useState } from "react";
import { docketStore } from "@/lib/dockets";
import {
  clean,
  complete,
  fieldsFor,
  LEVELS,
  levelFromTitle,
  portfolioStore,
  tasks,
  topicTitle,
  type Task,
} from "@/lib/portfolio";
import { S_DISCLAIMER, S_JAP_OFF, S_JAP_ON } from "@/lib/strings";
import type { SyncState } from "@/lib/sync";
import type { Character, Docket, Portfolio, PortfolioEntry, PortfolioLevel } from "@/lib/types";
import { useDocketVersion } from "@/ui/useStore";

export const JAP_TITLE = "Judicial Advancement Portfolio";

export interface JapViewProps {
  /** The active character when they are a Court Commissioner, else null (the gate shows). */
  commissioner: Character | null;
  syncOn: boolean;
  syncState: SyncState;
  /** "Turn on sync": open Characters and start sync. */
  onTurnOnSync(): void;
}

export default function JapView({ commissioner, syncOn, syncState, onTurnOnSync }: JapViewProps) {
  return (
    <section id="jap-view" className="form-view">
      {commissioner ? (
        // Re-key on the character and on every applied server copy, so the work reloads from the store.
        <JapBody
          key={commissioner.id + ":" + syncState.applied}
          character={commissioner}
          syncOn={syncOn}
          syncState={syncState}
          onTurnOnSync={onTurnOnSync}
        />
      ) : (
        <>
          <JapHead level="I" disabled onLevel={() => {}} />
          <div id="jap-gate" className="jap-note">
            <p>
              The J.A.P. is for Court Commissioners. Pick a character whose title is{" "}
              <strong>Court Commissioner I</strong> or <strong>Court Commissioner II</strong> under <em>Filing as</em>,
              or set the title in Characters.
            </p>
          </div>
        </>
      )}
      <p className="disclaimer form-foot">{S_DISCLAIMER}</p>
    </section>
  );
}

function JapHead({
  level,
  disabled,
  onLevel,
}: {
  level: PortfolioLevel;
  disabled: boolean;
  onLevel(l: PortfolioLevel): void;
}) {
  return (
    <div className="form-head">
      <div>
        <p className="crumb muted">Court Commissioners</p>
        <h2>{JAP_TITLE}</h2>
      </div>
      <label className="jap-level">
        Template
        <select
          id="jap-level"
          aria-label="Portfolio template"
          value={level}
          disabled={disabled}
          onChange={(e) => onLevel(e.target.value === "II" ? "II" : "I")}
        >
          <option value="I">{LEVELS.I.title}</option>
          <option value="II">{LEVELS.II.title}</option>
        </select>
      </label>
    </div>
  );
}

type Work = Record<PortfolioLevel, Record<string, PortfolioEntry[]>>;

/** The rows on screen: saved entries, padded to each task's count (at least one). */
function padWork(
  level: PortfolioLevel,
  saved: Record<string, PortfolioEntry[]> | undefined,
): Record<string, PortfolioEntry[]> {
  const out: Record<string, PortfolioEntry[]> = {};
  for (const t of tasks(level)) {
    if (!t.kind) continue;
    const list = ((saved || {})[t.id] || []).map((e) => ({ ...e }));
    while (list.length < (t.count || 1)) list.push({});
    out[t.id] = list;
  }
  return out;
}

function titleWords(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Task notes are BBCode; on screen the [url] tags become their text. */
function noteText(s: string): string {
  return s.replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/g, "$1");
}

function nounFor(t: Task): string {
  if (t.kind === "AW" || t.kind === "SW" || t.kind === "ESW") return "warrant";
  return t.kind === "transcript" ? "session" : "case";
}

function docketLabel(d: Docket): string {
  const parties = [d.plaintiff, d.defendant].filter(Boolean).join(" v. ");
  return d.caseNumber + (parties ? " · " + parties : "") + (d.status === "Closed" ? " (closed)" : "");
}

const URL_OK = /^https?:\/\/\S+$/i;

interface BodyProps {
  character: Character;
  syncOn: boolean;
  syncState: SyncState;
  onTurnOnSync(): void;
}

function JapBody({ character, syncOn, syncState, onTurnOnSync }: BodyProps) {
  const charId = character.id;
  const [data, setData] = useState<Portfolio>(
    () => portfolioStore().get(charId) || clean({ level: levelFromTitle(character.title) }),
  );
  const [work, setWork] = useState<Work>(() => ({ I: padWork("I", data.I), II: padWork("II", data.II) }));
  const [saveError, setSaveError] = useState("");
  const focusId = useRef<string | null>(null);
  const docketVersion = useDocketVersion();
  const dockets = useMemo(() => (docketVersion >= 0 ? docketStore().list(charId) : []), [charId, docketVersion]);

  const level = data.level;
  const saved = data[level] || {};

  useEffect(() => {
    if (!focusId.current) return;
    document.getElementById(focusId.current)?.focus();
    focusId.current = null;
  });

  /** Save the screen's work (every edit saves immediately). */
  const persist = (nextLevel: PortfolioLevel, nextWork: Work) => {
    setWork(nextWork);
    try {
      const stored = portfolioStore().save(charId, { level: nextLevel, I: nextWork.I, II: nextWork.II });
      if (stored) setData(stored);
      setSaveError("");
    } catch (err) {
      setData((d) => ({ ...d, level: nextLevel }));
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateList = (taskId: string, fn: (list: PortfolioEntry[]) => PortfolioEntry[], save = true) => {
    const nextWork: Work = { ...work, [level]: { ...work[level], [taskId]: fn(work[level][taskId] || []) } };
    if (save) persist(level, nextWork);
    else setWork(nextWork);
  };

  const setEntry = (t: Task, i: number, key: keyof PortfolioEntry, value: string) => {
    updateList(t.id, (list) =>
      list.map((e, j) => {
        if (j !== i) return e;
        const next: PortfolioEntry = { ...e, [key]: value };
        // A case number from this character's docket brings its name and thread link.
        if (key === "num" && fieldsFor(t.kind).some((f) => f.key === "caption")) {
          const d = docketStore().findByCase(charId, value);
          if (d) {
            const caption = [d.plaintiff, d.defendant].filter(Boolean).join(" v. ");
            if (caption && !next.caption) next.caption = caption;
            if (d.link && !next.link) next.link = d.link;
          }
        }
        return next;
      }),
    );
  };

  const move = (t: Task, i: number, d: -1 | 1) =>
    updateList(t.id, (list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = list.slice();
      next.splice(j, 0, next.splice(i, 1)[0]);
      return next;
    });

  const removeAt = (t: Task, i: number) =>
    updateList(t.id, (list) => {
      const next = list.filter((_, j) => j !== i);
      while (next.length < (t.count || 1)) next.push({});
      return next;
    });

  const add = (t: Task) => {
    const n = (work[level][t.id] || []).length;
    focusId.current = inputId(t, n, fieldsFor(t.kind)[0].key);
    updateList(t.id, (list) => [...list, {}], false);
  };

  const topic = topicTitle(character.name);
  const serverText = syncOn
    ? /error|offline|conflict/.test(syncState.status) && syncState.message
      ? syncState.message
      : S_JAP_ON
    : S_JAP_OFF;

  return (
    <>
      <JapHead level={level} disabled={false} onLevel={(l) => persist(l, work)} />
      <div id="jap-body">
        <div className="jap-note">
          {level === "I" ? (
            <p id="jap-where">
              Post this as a new topic titled <strong>{topic}</strong>. When you&apos;re promoted to Court Commissioner
              II, switch the template to CC II above and reply to that same topic with it.
            </p>
          ) : (
            <p id="jap-where">
              Started out as a Court Commissioner I? Reply to your existing J.A.P. topic with this. Starting at Court
              Commissioner II? Post it as a new topic titled <strong>{topic}</strong>.
            </p>
          )}
          <p className="small muted">
            Only completed motions, cases and warrants count. Work done as a Court Commissioner I can&apos;t be used for
            the Court Commissioner II portfolio, so each template keeps its own list.
          </p>
        </div>
        <div className={"jap-note jap-server" + (syncOn ? "" : " off")} id="jap-server">
          <p className="small" id="jap-server-text">
            {serverText}
          </p>
          {!syncOn && (
            <button className="btn primary" id="jap-sync" type="button" onClick={onTurnOnSync}>
              Turn on sync
            </button>
          )}
        </div>
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}
        <datalist id="jap-cases">
          {dockets.map((d) => (
            <option key={d.id} value={d.caseNumber} label={docketLabel(d)} />
          ))}
        </datalist>
        <div id="jap-fields">
          {LEVELS[level].sections.map((s, si) => {
            let done = 0;
            let need = 0;
            let added = 0;
            for (const t of s.tasks) {
              const n = (saved[t.id] || []).filter((e) => complete(t.kind, e)).length;
              if (t.count) {
                done += Math.min(n, t.count);
                need += t.count;
              } else added += n;
            }
            const meta = need ? done + " of " + need : added ? added + " added" : "";
            return (
              <details key={level + si} className={"section" + (need > 0 && done >= need ? " done" : "")} open>
                <summary>
                  <span className="section-title">{titleWords(s.title).replace(/^Section (\d)\. /, "$1. ")}</span>
                  <span className="section-meta">{meta}</span>
                </summary>
                <div className="section-body jap-section">
                  {s.intro && <p className="help jap-intro">{s.intro}</p>}
                  {s.tasks.map((t) => (
                    <JapTask
                      key={t.id}
                      task={t}
                      list={work[level][t.id] || []}
                      saved={saved[t.id] || []}
                      onEntry={(i, key, v) => setEntry(t, i, key, v)}
                      onMove={(i, d) => move(t, i, d)}
                      onRemove={(i) => removeAt(t, i)}
                      onAdd={() => add(t)}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </>
  );
}

function inputId(t: Task, i: number, key: string): string {
  return "jap-" + t.id.replace(".", "-") + "-" + i + "-" + key;
}

interface TaskProps {
  task: Task;
  list: PortfolioEntry[];
  saved: PortfolioEntry[];
  onEntry(i: number, key: keyof PortfolioEntry, value: string): void;
  onMove(i: number, d: -1 | 1): void;
  onRemove(i: number): void;
  onAdd(): void;
}

function JapTask({ task: t, list, saved, onEntry, onMove, onRemove, onAdd }: TaskProps) {
  const n = saved.filter((e) => complete(t.kind, e)).length;
  const count = t.count ? Math.min(n, t.count) + " of " + t.count + " done" : t.kind && n ? n + " added" : "optional";
  const min = t.count || 1;
  const noun = nounFor(t);
  const parts = fieldsFor(t.kind);
  const withCases = t.kind === "case" || t.kind === "civil" || t.kind === "probation";

  return (
    <fieldset className="block jap-task">
      <legend>
        {t.id + ". " + t.text}
        <span className={"jap-count" + (t.count && n >= t.count ? " done" : "")}>{count}</span>
      </legend>
      {t.note && <p className="help">{noteText(t.note)}</p>}
      {!t.kind ? (
        <p className="help">Nothing to list for this one. It goes into your post as it is.</p>
      ) : (
        <>
          {list.map((entry, i) => (
            <div className="item" key={i}>
              <div className="item-head">
                <span className="item-num">{noun + " " + (i + 1)}</span>
                <span className="spacer" />
                <button
                  type="button"
                  className="mini"
                  title="Move up"
                  aria-label={"Move " + noun + " " + (i + 1) + " up"}
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="mini"
                  title="Move down"
                  aria-label={"Move " + noun + " " + (i + 1) + " down"}
                  disabled={i === list.length - 1}
                  onClick={() => onMove(i, 1)}
                >
                  ↓
                </button>
                <button type="button" className="mini danger-quiet" onClick={() => onRemove(i)}>
                  {list.length > min ? "Remove" : "Clear"}
                </button>
              </div>
              <div className="jap-entry">
                {parts.map((f) => {
                  const id = inputId(t, i, f.key);
                  const value = entry[f.key] || "";
                  const bad = !!f.url && !!value.trim() && !URL_OK.test(value.trim());
                  return (
                    <div className="field" key={f.key}>
                      <label htmlFor={id}>{f.label}</label>
                      <input
                        id={id}
                        type={f.url ? "url" : f.date ? "date" : "text"}
                        placeholder={f.date ? undefined : f.url ? "https://…" : f.ph}
                        list={f.key === "num" && withCases ? "jap-cases" : undefined}
                        className={bad ? "invalid" : undefined}
                        aria-invalid={bad || undefined}
                        aria-describedby={bad ? id + "-hint" : undefined}
                        value={value}
                        onChange={(e) => onEntry(i, f.key, e.target.value)}
                      />
                      {bad && (
                        <p className="help" id={id + "-hint"}>
                          Needs to be a full link starting with https://
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" className="btn add" onClick={onAdd}>
            {"+ Add another " + noun}
          </button>
        </>
      )}
    </fieldset>
  );
}
