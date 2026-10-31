// One open form: header, docket bar, generated inputs (FR4, FR11 form part).
// The docket bar picks from and saves to the firm's Case File (LP-100).
//
// App renders <FormView key={form.id}>, so every form mounts with fresh state
// (plan §R R1). Edits go through the pure formState update API; the draft is
// written through a debounced writer that is flushed (never cancelled) on
// unmount and on pagehide, and the output is rendered during render and
// published to App before paint (a layout effect), so it never waits on a frame.

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { hasDocket } from "@/lib/characters";
import { caseStore, filterCases, isMember } from "@/lib/cases";
import { addDeadlines, formatDay, formDates } from "@/lib/deadlines";
import { contactStore } from "@/lib/contacts";
import { docketStore } from "@/lib/dockets";
import { exhibitRefs, refreshExhibitRefs, resolveExhibitRefs, type ExhibitRef } from "@/lib/exhibits";
import { letterheadStore } from "@/lib/letterhead";
import { draftHistory, snapshotTime, SNAPSHOT_EVERY_MS, type Snapshot } from "@/lib/draftHistory";
import { createDraftWriter, type DraftWriter } from "@/lib/draftWriter";
import { filingStore, type FilingVia } from "@/lib/filings";
import {
  applyPrefills,
  change,
  COLLAPSED_KEY,
  docketToForm,
  draftKey,
  fillFromCharacter,
  formToDocketPatch,
  hasField,
  materializeBlocks,
  missingRequired,
  openState,
  readDraft,
  redo,
  segments as splitSegments,
  startUndo,
  undo,
  writeDraft,
  type FormState,
  type MissingField,
  type Undoable,
} from "@/lib/formState";
import { defaultKV, isObject, readJson, writeJson } from "@/lib/storage";
import { S_DISCLAIMER } from "@/lib/strings";
import { compileForm, render } from "@/lib/template";
import type { Character, Docket, FormDef } from "@/lib/types";
import { FormContext, slugId, type FieldTarget, type FormCtx } from "./fields/FormContext";
import Sections from "./fields/Sections";
import DraftHistoryDialog from "./DraftHistoryDialog";
import LawLibraryDialog from "./LawLibraryDialog";
import type { SafeHtml } from "@/lib/safeHtml";
import { useCaseVersion, useContactVersion, useLetterheadVersion } from "@/ui/useStore";

export interface FormOutput {
  /** Final HTML (no highlight): Copy for forum, BBCode, .docx. Rendered, so SafeHtml (LP-5). */
  finalHtml: SafeHtml;
  /** What the preview shows (highlight per the checkbox). */
  previewHtml: SafeHtml;
  /** Required fields still empty (LP-87): the copy buttons warn before copying. */
  missing: MissingField[];
  /** Open the field's section and focus it. */
  jumpTo(m: MissingField): void;
  /** A copy or download went through: keep it in the filing history (LP-15). */
  onFiled(via: FilingVia): void;
}

export interface FormViewProps {
  form: FormDef;
  activeCharacter: Character | null;
  highlight: boolean;
  /**
   * The rendered output, or null when the template couldn't be compiled (the output pane hides),
   * tagged with the form it belongs to so App never shows another form's output.
   */
  onOutput(o: FormOutput | null, formId: string): void;
  /** This form's view is going away: drop its output (so a later reopen can't show it). */
  onOutputGone?(formId: string): void;
  /** A docket to load (Dockets dialog "Use in form"); each new `seq` loads once. */
  docketRequest?: DocketRequest | null;
  /** Reports whether the docket bar is shown (so the Dockets dialog can offer "Use in form"). */
  onDocketBar?(shown: boolean): void;
  /** A filing to open as a new draft of this form (Filing history, LP-15); each new `seq` once. */
  draftRequest?: DraftRequest | null;
  /** This form's filing tools, for the Court Filings program's Form menu (LP-105); null when it goes. */
  onTools?(tools: FormTools | null): void;
}

/** What the open form offers the Court Filings program's Form menu (LP-105). */
export interface FormTools {
  /** The template compiled (Draft history needs it). */
  ready: boolean;
  openDraftHistory(): void;
  openLibrary(): void;
  /** Focus the docket bar's case picker; null when the form has no docket bar. */
  pickCase: (() => void) | null;
  /** The firm case with this form's case number, if any (Open case in Case File). */
  caseId: string | null;
}

export interface DraftRequest {
  formId: string;
  state: FormState;
  /** When the filing was made, for the message. */
  at: string;
  seq: number;
}

export interface DocketRequest {
  docketId: string;
  seq: number;
}

function readCollapsed(id: string): Set<string> {
  const all = readJson<Record<string, unknown>>(defaultKV(), COLLAPSED_KEY);
  const list = all && typeof all === "object" ? all[id] : null;
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
}

function saveCollapsed(id: string, names: string[]): void {
  const kv = defaultKV();
  const raw = readJson<Record<string, unknown>>(kv, COLLAPSED_KEY);
  const all = isObject(raw) ? raw : {};
  try {
    writeJson(kv, COLLAPSED_KEY, { ...all, [id]: names });
  } catch {
    // best-effort, like drafts
  }
}

function docketLabel(d: Docket): string {
  const parties = [d.plaintiff, d.defendant].filter(Boolean).join(" v. ");
  return d.caseNumber + (parties ? " · " + parties : "") + (d.status === "Closed" ? " (closed)" : "");
}

export default function FormView({
  form,
  activeCharacter,
  highlight,
  onOutput,
  onOutputGone,
  docketRequest,
  onDocketBar,
  draftRequest,
  onTools,
}: FormViewProps) {
  // The real "now" fed to every date producer: Today, Auto, prefills and the case-number year,
  // which turn it into game time (New York, 36 years back; LP-135). Fixed while the form is open
  // (new Date() on every render would thrash the ctx memo); opening a form takes the time again.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- form.id is the signal: a new form takes today's date
  const now = useMemo(() => new Date(), [form.id]);

  // `now` also feeds the case-number placeholder/fallback pattern.
  const compiled = useMemo(() => compileForm(form, now), [form, now]);
  const { tree, entries } = compiled;

  // R1: the opening state mirrors the reference openForm (draft → blocks → prefills → character fill).
  // Undo and redo (LP-89): the state lives in an Undoable, and every change goes through setState.
  const [undoable, setUndoable] = useState<Undoable>(() =>
    startUndo(openState(entries, readDraft(defaultKV(), form.id), activeCharacter, now)),
  );
  const state = undoable.state;
  /** Apply a change as an undo step; `key` (the field being typed in) groups typing into one step. */
  const setState = useCallback((next: FormState | ((s: FormState) => FormState), key: string | null = null) => {
    const at = Date.now();
    setUndoable((u) => change(u, typeof next === "function" ? next(u.state) : next, key, at));
  }, []);
  const doUndo = useCallback(() => setUndoable(undo), []);
  const doRedo = useCallback(() => setUndoable(redo), []);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The Law Library (LP-16): Insert citation goes into the written field last focused.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [citeTarget, setCiteTarget] = useState<FieldTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(form.id));
  const [flash, setFlash] = useState<{ text: string; bad: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The writer captures this form's id, so a flush after unmount lands on the right key.
  const [writer] = useState<DraftWriter>(() => createDraftWriter((s) => writeDraft(defaultKV(), form.id, s)));

  useEffect(() => {
    writer.schedule(state);
  }, [writer, state]);

  useEffect(() => {
    const onHide = () => writer.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      writer.flush();
    };
  }, [writer]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Draft history (LP-89): a snapshot at most every few minutes while the form is edited.
  // The opening state isn't an edit, so it's never snapshotted on its own.
  const opened = useRef(state);
  const lastSnapshot = useRef<number | null>(null);
  const keepSnapshot = useCallback(
    (s: FormState) => {
      if (draftHistory().add(form.id, s)) lastSnapshot.current = Date.now();
    },
    [form.id],
  );
  useEffect(() => {
    if (state === opened.current) return;
    if (lastSnapshot.current === null) lastSnapshot.current = draftHistory().lastAt(form.id);
    if (Date.now() - lastSnapshot.current >= SNAPSHOT_EVERY_MS) keepSnapshot(state);
  }, [state, form.id, keepSnapshot]);

  // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) undo and redo while the form, or nothing, has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === "z" && !e.shiftKey;
      const isRedo = k === "y" || (k === "z" && e.shiftKey);
      if (!isUndo && !isRedo) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && target !== document.body && !target.closest("#form-view")) return;
      if (target?.closest("dialog")) return;
      e.preventDefault();
      if (isUndo) doUndo();
      else doRedo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // Another active character (or the same one edited/synced): re-fill only what's empty or still ours.
  const charRef = useRef(activeCharacter);
  useEffect(() => {
    if (charRef.current === activeCharacter) return;
    charRef.current = activeCharacter;
    setState((s) => fillFromCharacter(entries, s, activeCharacter, false));
  }, [activeCharacter, entries, setState]);

  // Output, derived during render: on mount the deferred values equal the opening state, so the
  // first output is ready in the first commit (no frame needed). Later edits re-render the
  // preview at transition priority, so typing stays responsive on long templates.
  const deferredValues = useDeferredValue(state.values);

  // A jump from the missing-fields list opens the field's section, then focuses it once rendered.
  const [focusKey, setFocusKey] = useState<{ key: string; seq: number } | null>(null);
  const jumpTo = useCallback((m: MissingField) => {
    setCollapsed((c) => {
      if (!c.has(m.section)) return c;
      const next = new Set(c);
      next.delete(m.section);
      return next;
    });
    setFocusKey((f) => ({ key: m.key, seq: (f ? f.seq : 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!focusKey) return;
    const el = document.getElementById(slugId(focusKey.key));
    if (!el) return;
    el.scrollIntoView?.({ block: "center" });
    el.focus({ preventScroll: true });
  }, [focusKey]);

  // Filing history (LP-15): the state and character at the moment of the copy.
  const latest = useRef({ state, activeCharacter });
  useEffect(() => {
    latest.current = { state, activeCharacter };
  });
  const onFiled = useCallback(
    (via: FilingVia) => {
      const { state: s, activeCharacter: who } = latest.current;
      const raw = s.values["Case number"];
      const caseNumber = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
      filingStore().add({
        formId: form.id,
        formTitle: form.title,
        charId: who ? who.id : null,
        charName: who?.name,
        caseNumber,
        caseId: caseNumber ? caseStore().byNumber(caseNumber)?.id || null : null,
        via,
        state: s,
      });
    },
    [form.id, form.title],
  );

  // Exhibits (LP-13): the firm case with this form's case number lends its evidence to the
  // exhibit list and to references typed into the text. Stable between case changes, so the
  // output memo doesn't churn.
  const caseVersion = useCaseVersion();
  const rawNumber = state.values["Case number"];
  const exhibitCase = typeof rawNumber === "string" ? rawNumber.trim() : "";
  /** The firm case with this form's case number (LP-13, LP-105), for its exhibits and the Form menu. */
  const linkedCase = useMemo(
    () => (exhibitCase && caseVersion >= 0 ? caseStore().byNumber(exhibitCase) : null),
    [exhibitCase, caseVersion],
  );
  const exhibits = useMemo<ExhibitRef[]>(() => (linkedCase ? exhibitRefs(linkedCase.exhibits) : []), [linkedCase]);
  // References in the editor follow the exhibits (a reorder's new letters, a renamed title),
  // on opening and whenever they change. Adjusted during render, not an undo step: it only
  // brings the reading text up to date, the ids don't change.
  const [seenExhibits, setSeenExhibits] = useState<ExhibitRef[] | null>(null);
  if (seenExhibits !== exhibits) {
    setSeenExhibits(exhibits);
    setUndoable((u) => {
      const values = refreshExhibitRefs(u.state.values, exhibits);
      return values === u.state.values ? u : { ...u, state: { ...u.state, values } };
    });
  }

  const letterheadVersion = useLetterheadVersion();
  const letterhead = useMemo(() => (letterheadVersion >= 0 ? letterheadStore().get() : undefined), [letterheadVersion]);

  const output = useMemo<FormOutput | null>(() => {
    if (!tree) return null;
    const values = resolveExhibitRefs(deferredValues, exhibits);
    const finalHtml = render(tree, values, { exhibits, letterhead });
    return {
      finalHtml,
      previewHtml: highlight ? render(tree, values, { highlight: true, exhibits, letterhead }) : finalHtml,
      missing: missingRequired(entries, deferredValues, form.required),
      jumpTo,
      onFiled,
    };
  }, [tree, entries, deferredValues, exhibits, letterhead, highlight, form.required, jumpTo, onFiled]);

  // Leaving clears this form's output in App, so reopening it never shows the old instance's.
  // Declared before the publish effect: on a StrictMode re-run the setups run in order, publish last.
  useLayoutEffect(() => () => onOutputGone?.(form.id), [form.id, onOutputGone]);

  // Published before the browser paints, so the pane never paints empty.
  useLayoutEffect(() => {
    onOutput(output, form.id);
  }, [output, onOutput, form.id]);

  const showFlash = (text: string, bad = false) => {
    setFlash({ text, bad });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 4000);
  };

  const onState = useCallback((fn: (s: FormState) => FormState, key?: string) => setState(fn, key ?? null), [setState]);
  const required = useMemo(() => new Set(form.required), [form.required]);
  const contactVersion = useContactVersion();
  const contacts = useMemo(() => (contactVersion >= 0 ? contactStore().list() : []), [contactVersion]);
  const ctx: FormCtx = useMemo(
    () => ({
      entries,
      character: activeCharacter,
      onState,
      now,
      required,
      exhibits,
      contacts,
      onFieldFocus: setCiteTarget,
    }),
    [entries, activeCharacter, onState, now, required, exhibits, contacts],
  );

  const segs = useMemo(() => splitSegments(entries), [entries]);
  const anyOpen = segs.some((sg) => !collapsed.has(sg.name));

  const toggleSection = (name: string, open: boolean) => {
    if (open !== collapsed.has(name)) return; // already in that state
    const next = new Set(collapsed);
    if (open) next.delete(name);
    else next.add(name);
    setCollapsed(next);
    saveCollapsed(
      form.id,
      segs.filter((sg) => next.has(sg.name)).map((sg) => sg.name),
    );
  };

  const toggleAll = () => {
    const next = anyOpen ? new Set(segs.map((sg) => sg.name)) : new Set<string>();
    setCollapsed(next);
    saveCollapsed(form.id, [...next]);
  };

  const fillCharacter = () => {
    if (!activeCharacter) {
      showFlash("Pick or create a character first.", true);
      return;
    }
    setState((s) => fillFromCharacter(entries, s, activeCharacter, true));
  };

  const clearForm = () => {
    if (!confirm("Clear everything you've entered in this form? Undo or Draft history can bring it back.")) return;
    keepSnapshot(state);
    defaultKV().remove(draftKey(form.id));
    setState(openState(entries, null, activeCharacter, now));
  };

  const restoreSnapshot = (snap: Snapshot) => {
    keepSnapshot(state);
    setState(snap.state);
    setHistoryOpen(false);
    showFlash("Restored the version from " + snapshotTime(snap.at) + ". Undo puts your draft back.");
  };

  /* ---------- docket bar ---------- */

  const judge = hasDocket(activeCharacter) ? activeCharacter : null;
  const showDocket = !!(judge && tree && hasField(entries, state.values, "Case number"));
  // The firm's cases: this character's first, then everyone else's (LP-100).
  const caseLists = useMemo(() => {
    if (!showDocket || !judge || caseVersion < 0) return { mine: [], others: [] };
    const all = filterCases(caseStore().list(), {});
    return { mine: all.filter((c) => isMember(c, judge.id)), others: all.filter((c) => !isMember(c, judge.id)) };
  }, [showDocket, judge, caseVersion]);
  const currentDocket = showDocket ? linkedCase : null;

  const loadDocket = (caseId: string) => {
    if (!judge) return;
    const d = caseStore().get(caseId);
    if (!d) return;
    const { state: loaded, filled } = docketToForm(entries, state, d);
    // A loaded judgement date reflows the case schedule.
    const m = { ...loaded, values: materializeBlocks(entries, loaded.values) };
    setState(applyPrefills(entries, m, now));
    showFlash("Loaded " + d.caseNumber + (filled > 1 ? " (" + filled + " fields filled)." : "."));
  };

  // Deadlines from the form's dates (LP-18), for the firm case with its case number.
  const [datesOpen, setDatesOpen] = useState(false);
  const dates = useMemo(
    () => (currentDocket ? formDates(entries, state.values) : []),
    [currentDocket, entries, state.values],
  );
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const openDates = () => {
    setUnpicked(new Set(dates.filter((d) => !d.suggested).map((d) => d.label)));
    setDatesOpen((o) => !o);
  };
  const addDates = () => {
    if (!currentDocket) return;
    const picked = dates.filter((d) => !unpicked.has(d.label));
    const before = currentDocket.deadlines.length;
    try {
      const saved = caseStore().save({ ...currentDocket, deadlines: addDeadlines(currentDocket.deadlines, picked) });
      const n = saved.deadlines.length - before;
      setDatesOpen(false);
      showFlash(
        n
          ? "Added " + n + (n === 1 ? " date" : " dates") + " to " + currentDocket.caseNumber + "'s deadlines."
          : "Those dates are already on " + currentDocket.caseNumber + ".",
      );
    } catch (err) {
      showFlash(err instanceof Error ? err.message : String(err), true);
    }
  };

  const saveToDocket = () => {
    if (!judge) return;
    const r = formToDocketPatch(form, entries, state.values);
    if ("error" in r) {
      showFlash(r.error, true);
      return;
    }
    const before = caseStore().byNumber(r.patch.caseNumber);
    try {
      // Through the docket view: the firm's case with this number is updated (with this
      // character put on it), or a new case is added with them as lead.
      docketStore().upsert(judge.id, r.patch);
      const n = r.patch.caseNumber;
      showFlash(
        !before
          ? "Added " + n + " to the Case File, with " + judge.name + " as lead."
          : isMember(before, judge.id)
            ? "Updated " + n + " in the Case File."
            : "Updated " + n + " in the Case File and put " + judge.name + " on it.",
      );
    } catch (err) {
      showFlash(err instanceof Error ? err.message : String(err), true);
    }
  };

  useEffect(() => {
    if (!onDocketBar) return;
    onDocketBar(showDocket);
    return () => onDocketBar(false);
  }, [showDocket, onDocketBar]);

  // The Form menu's tools (LP-105): the same actions as the buttons here, reported when they change.
  const linkedCaseId = linkedCase ? linkedCase.id : null;
  const ready = !!tree;
  useEffect(() => {
    if (!onTools) return;
    onTools({
      ready,
      openDraftHistory: () => setHistoryOpen(true),
      openLibrary: () => setLibraryOpen(true),
      pickCase: showDocket ? () => document.getElementById("docket-pick")?.focus() : null,
      caseId: linkedCaseId,
    });
  }, [onTools, ready, showDocket, linkedCaseId]);
  useEffect(() => (onTools ? () => onTools(null) : undefined), [onTools]);

  // "Use in form" from the Dockets dialog: load each request once (a request older than this view is skipped).
  const handledRequest = useRef(docketRequest ? docketRequest.seq : 0);
  useEffect(() => {
    if (!docketRequest || docketRequest.seq === handledRequest.current) return;
    handledRequest.current = docketRequest.seq;
    loadDocket(docketRequest.docketId);
    // loadDocket reads this render's state; only a new request should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the request alone
  }, [docketRequest]);

  // "Use as new draft" from Filing history while this form is open: an undo step, with the
  // current draft kept in draft history first.
  const handledDraft = useRef(draftRequest ? draftRequest.seq : 0);
  useEffect(() => {
    if (!draftRequest || draftRequest.seq === handledDraft.current || draftRequest.formId !== form.id) return;
    handledDraft.current = draftRequest.seq;
    keepSnapshot(state);
    setState(draftRequest.state);
    showFlash("Opened the filing from " + snapshotTime(draftRequest.at) + " as a new draft. Undo puts yours back.");
    // Reads this render's state; only a new request should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the request alone
  }, [draftRequest]);

  return (
    <section id="form-view" className="form-view">
      <div className="form-head">
        <div>
          <p className="crumb muted" id="form-crumb">
            {[form.court, form.section].filter(Boolean).join(" · ")}
          </p>
          <h2 id="form-title">{form.title}</h2>
        </div>
        <div className="form-head-actions">
          {segs.length >= 2 && tree && (
            <button className="btn" id="collapse-all" type="button" onClick={toggleAll}>
              {anyOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          <button
            className="btn"
            id="fill-character"
            type="button"
            title="Fill name, title, phone… from the active character"
            onClick={fillCharacter}
            disabled={!tree}
          >
            Fill from character
          </button>
          <button
            className="btn"
            id="undo"
            type="button"
            title="Undo (Ctrl+Z)"
            onClick={doUndo}
            disabled={!undoable.past.length}
          >
            Undo
          </button>
          <button
            className="btn"
            id="redo"
            type="button"
            title="Redo (Ctrl+Y)"
            onClick={doRedo}
            disabled={!undoable.future.length}
          >
            Redo
          </button>
          <button
            className="btn"
            id="open-history"
            type="button"
            title="Earlier versions of this draft"
            onClick={() => setHistoryOpen(true)}
            disabled={!tree}
          >
            Draft history
          </button>
          <button
            className="btn"
            id="open-library"
            type="button"
            title="Search the firm's precedents and insert a citation"
            onClick={() => setLibraryOpen(true)}
            disabled={!tree}
          >
            Law Library
          </button>
          <button className="btn danger-quiet" id="reset-form" type="button" onClick={clearForm} disabled={!tree}>
            Clear form
          </button>
        </div>
      </div>

      {showDocket && judge && (
        <div className="docket-bar" id="docket-bar">
          <label htmlFor="docket-pick">Case</label>
          <select
            id="docket-pick"
            value={currentDocket ? currentDocket.id : ""}
            onChange={(e) => {
              if (e.target.value) loadDocket(e.target.value);
            }}
          >
            <option value="">— load a case from the Case File —</option>
            {caseLists.mine.length > 0 && (
              <optgroup label={judge.name + "'s cases"}>
                {caseLists.mine.map((d) => (
                  <option key={d.id} value={d.id}>
                    {docketLabel(d)}
                  </option>
                ))}
              </optgroup>
            )}
            {caseLists.others.length > 0 && (
              <optgroup label="Other firm cases">
                {caseLists.others.map((d) => (
                  <option key={d.id} value={d.id}>
                    {docketLabel(d)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            className="btn"
            id="docket-save"
            type="button"
            title="Add this case to the Case File, or update it"
            onClick={saveToDocket}
          >
            Save to Case File
          </button>
          {currentDocket && (
            <a className="btn" id="docket-open-case" href={"#cases/" + currentDocket.id} title="Open this case">
              Open in Case File
            </a>
          )}
          {dates.length > 0 && (
            <button
              className="btn"
              id="dates-open"
              type="button"
              aria-expanded={datesOpen}
              title={"Add this form's dates to " + (currentDocket?.caseNumber || "the case") + "'s deadlines"}
              onClick={openDates}
            >
              Add dates to case
            </button>
          )}
        </div>
      )}

      {showDocket && datesOpen && currentDocket && dates.length > 0 && (
        <div className="dates-panel" id="dates-panel">
          <p className="small">{"Add to " + currentDocket.caseNumber + "'s deadlines (in-game dates):"}</p>
          <ul>
            {dates.map((d) => (
              <li key={d.label}>
                <label className="field check">
                  <input
                    type="checkbox"
                    checked={!unpicked.has(d.label)}
                    onChange={(e) =>
                      setUnpicked((u) => {
                        const next = new Set(u);
                        if (e.target.checked) next.delete(d.label);
                        else next.add(d.label);
                        return next;
                      })
                    }
                  />
                  <span>{d.label + " · " + formatDay(d.date)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <button
              className="btn primary"
              type="button"
              id="dates-add"
              onClick={addDates}
              disabled={unpicked.size === dates.length}
            >
              {"Add to " + currentDocket.caseNumber}
            </button>
            <button className="btn" type="button" onClick={() => setDatesOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {compiled.error !== null ? (
        <div className="error-box" role="alert">
          <span className="error-icon" aria-hidden="true">
            ✕
          </span>
          <p>{"This form's template couldn't be loaded: " + compiled.error}</p>
        </div>
      ) : (
        <FormContext.Provider value={ctx}>
          <form id="fields" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <Sections segments={segs} values={state.values} collapsed={collapsed} onToggle={toggleSection} />
          </form>
        </FormContext.Provider>
      )}

      <p className="disclaimer form-foot">{S_DISCLAIMER}</p>

      <LawLibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} target={citeTarget} />
      {tree && (
        <DraftHistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          formId={form.id}
          formTitle={form.title}
          tree={tree}
          onRestore={restoreSnapshot}
        />
      )}

      <div className="status-bar editor-status">
        <span
          className={"status" + (flash ? (flash.bad ? " bad" : " good") : "")}
          id="docket-status"
          role="status"
          aria-live="polite"
        >
          {flash ? flash.text : ""}
        </span>
      </div>
    </section>
  );
}
