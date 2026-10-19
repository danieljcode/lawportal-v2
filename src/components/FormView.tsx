// One open form: header, docket bar, generated inputs (FR4, FR11 form part).
//
// App renders <FormView key={form.id}>, so every form mounts with fresh state
// (plan §R R1). Edits go through the pure formState update API; the draft is
// written through a debounced writer that is flushed (never cancelled) on
// unmount and on pagehide, and the output is rendered during render and
// published to App before paint (a layout effect), so it never waits on a frame.

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { hasDocket } from "@/lib/characters";
import { docketStore } from "@/lib/dockets";
import { createDraftWriter, type DraftWriter } from "@/lib/draftWriter";
import {
  applyPrefills,
  COLLAPSED_KEY,
  docketToForm,
  draftKey,
  fillFromCharacter,
  formToDocketPatch,
  hasField,
  LAST_FORM_KEY,
  materializeBlocks,
  openState,
  readDraft,
  segments as splitSegments,
  writeDraft,
  type FormState,
} from "@/lib/formState";
import { gameDate } from "@/lib/freestyle";
import { defaultKV, readJson, writeJson } from "@/lib/storage";
import { S_DISCLAIMER } from "@/lib/strings";
import { caseNumberPattern, compile, fields, render } from "@/lib/template";
import type { Character, Docket, Entry, FormDef, Node, Tree } from "@/lib/types";
import { FormContext, type FormCtx } from "./fields/FormContext";
import Sections from "./fields/Sections";
import type { SafeHtml } from "@/lib/safeHtml";
import { useDocketVersion } from "./useStore";

export interface FormOutput {
  /** Final HTML (no highlight): Copy for forum, BBCode, .docx. Rendered, so SafeHtml (LP-5). */
  finalHtml: SafeHtml;
  /** What the preview shows (highlight per the checkbox). */
  previewHtml: SafeHtml;
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
}

export interface DocketRequest {
  docketId: string;
  seq: number;
}

type Compiled = { tree: Tree; entries: Entry[]; error: null } | { tree: null; entries: Entry[]; error: string };

/**
 * Rewrite every "Case number" field that carries a prefill so the editor box
 * starts EMPTY while the in-game pattern becomes the field's fallback. The
 * fallback is what `render` emits for a blank field (so the pattern still appears
 * in every output) and what `FieldInput` shows as the input placeholder. Dropping
 * the prefill stops `applyPrefills` from pre-filling the value, so the box is
 * visually empty until typed. The pattern names our courthouse (src/lib/courts.ts), e.g. `90SCCR00XXX`.
 *
 * Fields are shared by reference between the tree and `fields(tree)`, so mutating
 * the field objects here is enough. Extra Templates use `{{Case number|____}}`
 * with no prefill and are left untouched (they already start empty and carry no
 * YY… pattern).
 */
function rewriteCaseNumbers(nodes: Node[], now: Date): void {
  for (const n of nodes) {
    if (n.kind === "field") {
      if (n.field.label === "Case number" && n.field.prefill) {
        n.field.fallback = caseNumberPattern(n.field, now);
        n.field.prefill = undefined;
      }
    } else if (n.kind === "block" || n.kind === "cond") {
      rewriteCaseNumbers(n.children, now);
    }
  }
}

function compileForm(form: FormDef, now: Date): Compiled {
  try {
    const tree = compile(form.html);
    rewriteCaseNumbers(tree.children, now);
    return { tree, entries: fields(tree), error: null };
  } catch (err) {
    console.error("[form] couldn't compile", form.id, err);
    return { tree: null, entries: [], error: err instanceof Error ? err.message : String(err) };
  }
}

function readCollapsed(id: string): Set<string> {
  const all = readJson<Record<string, unknown>>(defaultKV(), COLLAPSED_KEY);
  const list = all && typeof all === "object" ? all[id] : null;
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
}

function saveCollapsed(id: string, names: string[]): void {
  const kv = defaultKV();
  const raw = readJson<Record<string, unknown>>(kv, COLLAPSED_KEY);
  const all = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
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
}: FormViewProps) {
  // The in-game "now" (FreestyleRP, 36 years back) fed to every date producer: Today, Auto,
  // prefills and the case-number year. Fixed while the form is open (new Date() on every
  // render would thrash the ctx memo); opening a form takes the current date again.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- form.id is the signal: a new form takes today's date
  const now = useMemo(() => gameDate(new Date()), [form.id]);

  // `now` also feeds the case-number placeholder/fallback pattern.
  const compiled = useMemo(() => compileForm(form, now), [form, now]);
  const { tree, entries } = compiled;

  // R1: the opening state mirrors the reference openForm (draft → blocks → prefills → character fill).
  const [state, setState] = useState<FormState>(() =>
    openState(entries, readDraft(defaultKV(), form.id), activeCharacter, now),
  );
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

  useEffect(() => {
    try {
      defaultKV().set(LAST_FORM_KEY, form.id);
    } catch {
      // private mode
    }
  }, [form.id]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Another active character (or the same one edited/synced): re-fill only what's empty or still ours.
  const charRef = useRef(activeCharacter);
  useEffect(() => {
    if (charRef.current === activeCharacter) return;
    charRef.current = activeCharacter;
    setState((s) => fillFromCharacter(entries, s, activeCharacter, false));
  }, [activeCharacter, entries]);

  // Output, derived during render: on mount the deferred values equal the opening state, so the
  // first output is ready in the first commit (no frame needed). Later edits re-render the
  // preview at transition priority, so typing stays responsive on long templates.
  const deferredValues = useDeferredValue(state.values);
  const output = useMemo<FormOutput | null>(() => {
    if (!tree) return null;
    const finalHtml = render(tree, deferredValues, {});
    return { finalHtml, previewHtml: highlight ? render(tree, deferredValues, { highlight: true }) : finalHtml };
  }, [tree, deferredValues, highlight]);

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

  const onState = useCallback((fn: (s: FormState) => FormState) => setState(fn), []);
  const ctx: FormCtx = useMemo(
    () => ({ entries, character: activeCharacter, onState, now }),
    [entries, activeCharacter, onState, now],
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
    if (!confirm("Clear everything you've entered in this form?")) return;
    defaultKV().remove(draftKey(form.id));
    setState(openState(entries, null, activeCharacter, now));
  };

  /* ---------- docket bar ---------- */

  const docketVersion = useDocketVersion();
  const judge = hasDocket(activeCharacter) ? activeCharacter : null;
  const showDocket = !!(judge && tree && hasField(entries, state.values, "Case number"));
  const dockets = useMemo(
    // docketVersion is a dependency so the list is re-read after any docket change.
    () => (showDocket && judge && docketVersion >= 0 ? docketStore().list(judge.id) : []),
    [showDocket, judge, docketVersion],
  );
  const caseNumber = typeof state.values["Case number"] === "string" ? (state.values["Case number"] as string) : "";
  const currentDocket = showDocket && judge && caseNumber ? docketStore().findByCase(judge.id, caseNumber) : null;

  const loadDocket = (docketId: string) => {
    if (!judge) return;
    const d = docketStore().get(judge.id, docketId);
    if (!d) return;
    const { state: loaded, filled } = docketToForm(entries, state, d);
    // A loaded judgement date reflows the case schedule.
    const m = { ...loaded, values: materializeBlocks(entries, loaded.values) };
    setState(applyPrefills(entries, m, now));
    showFlash("Loaded " + d.caseNumber + (filled > 1 ? " (" + filled + " fields filled)." : "."));
  };

  const saveToDocket = () => {
    if (!judge) return;
    const r = formToDocketPatch(form, entries, state.values);
    if ("error" in r) {
      showFlash(r.error, true);
      return;
    }
    const existed = !!docketStore().findByCase(judge.id, r.patch.caseNumber);
    try {
      docketStore().upsert(judge.id, r.patch);
      showFlash((existed ? "Updated " : "Added ") + r.patch.caseNumber + " on " + judge.name + "'s docket.");
    } catch (err) {
      showFlash(err instanceof Error ? err.message : String(err), true);
    }
  };

  useEffect(() => {
    if (!onDocketBar) return;
    onDocketBar(showDocket);
    return () => onDocketBar(false);
  }, [showDocket, onDocketBar]);

  // "Use in form" from the Dockets dialog: load each request once (a request older than this view is skipped).
  const handledRequest = useRef(docketRequest ? docketRequest.seq : 0);
  useEffect(() => {
    if (!docketRequest || docketRequest.seq === handledRequest.current) return;
    handledRequest.current = docketRequest.seq;
    loadDocket(docketRequest.docketId);
    // loadDocket reads this render's state; only a new request should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the request alone
  }, [docketRequest]);

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
          <button className="btn danger-quiet" id="reset-form" type="button" onClick={clearForm} disabled={!tree}>
            Clear form
          </button>
        </div>
      </div>

      {showDocket && judge && (
        <div className="docket-bar" id="docket-bar">
          <label htmlFor="docket-pick">Docket</label>
          <select
            id="docket-pick"
            value={currentDocket ? currentDocket.id : ""}
            onChange={(e) => {
              if (e.target.value) loadDocket(e.target.value);
            }}
          >
            <option value="">{"— load a case from " + judge.name + "'s docket —"}</option>
            {dockets.map((d) => (
              <option key={d.id} value={d.id}>
                {docketLabel(d)}
              </option>
            ))}
          </select>
          <button
            className="btn"
            id="docket-save"
            type="button"
            title="Add this case to your docket, or update it"
            onClick={saveToDocket}
          >
            Save to docket
          </button>
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
