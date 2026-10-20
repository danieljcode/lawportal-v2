"use client";

// The app shell (design §UI components): the active character, the output of
// the open form, the narrow-screen drawer and the Win95 window around the three
// panes. Routing is useRoute.ts and the dialogs useDialogs.ts (LP-7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_FORMS } from "@/data";
import { characterStore, hasDocket } from "@/lib/characters";
import { caseStore } from "@/lib/cases";
import { dueSoonCount, gameToday } from "@/lib/deadlines";
import { draftHistory, hasContent } from "@/lib/draftHistory";
import type { Filing } from "@/lib/filings";
import { readDraft, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import { isCommissioner } from "@/lib/portfolio";
import { EMPTY_HTML } from "@/lib/safeHtml";
import * as sync from "@/lib/sync";
import ChangelogDialog from "./ChangelogDialog";
import CharactersDialog from "./CharactersDialog";
import DocketsDialog from "./DocketsDialog";
import EmptyState from "./EmptyState";
import FilingsDialog from "./FilingsDialog";
import FormView, { type DraftRequest, type FormOutput } from "./FormView";
import JapOutput from "./JapOutput";
import JapView from "./JapView";
import CaseFileView from "./CaseFileView";
import UpcomingView from "./UpcomingView";
import IntakeView from "./IntakeView";
import BootScreen from "./BootScreen";
import ConflictCheckView from "./ConflictCheckView";
import LawLibraryView from "./LawLibraryView";
import ErrorBoundary from "./ErrorBoundary";
import OutputPane from "./OutputPane";
import Sidebar from "./Sidebar";
import Taskbar from "./Taskbar";
import Toolbar from "./Toolbar";
import { S_SET_ASIDE, S_SET_ASIDE_HINT } from "@/lib/strings";
import { useDialogs } from "./useDialogs";
import {
  APP_TITLE,
  CASES_TITLE,
  CONFLICTS_TITLE,
  INTAKE_TITLE,
  JAP_TITLE,
  LIBRARY_TITLE,
  UPCOMING_TITLE,
  useRoute,
} from "./useRoute";
import { useCaseVersion, useCharacterVersion, useSetAsideVersion, useSyncState } from "./useStore";

export type { DialogName } from "./useDialogs";
export type { Route } from "./useRoute";

const EMPTY_OUTPUT: FormOutput = {
  finalHtml: EMPTY_HTML,
  previewHtml: EMPTY_HTML,
  missing: [],
  jumpTo: () => {},
  onFiled: () => {},
};

export default function App() {
  const { route, form, goHome } = useRoute();
  const {
    dialog,
    docketsFor,
    autoSync,
    docketRequest,
    changelogUnread,
    openDockets,
    openCharacters,
    openChangelog,
    openFilings,
    closeDialog,
    autoSyncDone,
    loadDocketInForm,
  } = useDialogs();
  const [navOpen, setNavOpen] = useState(false);
  /** Filing history's "Use as new draft" for the form already open (LP-15). */
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);

  /**
   * Open a filing as a new draft of its form (LP-15). The open form takes it as an undo step;
   * for another form the draft is replaced (after asking, keeping the old one in draft history)
   * and the form opened.
   */
  const openFiling = (f: Filing) => {
    closeDialog();
    if (route.kind === "form" && route.id === f.formId) {
      setDraftRequest((r) => ({ formId: f.formId, state: f.state, at: f.at, seq: (r ? r.seq : 0) + 1 }));
      return;
    }
    const kv = defaultKV();
    const existing = readDraft(kv, f.formId);
    if (existing && hasContent(existing.values)) {
      const question = "Replace your current draft of " + f.formTitle + " with this filing?";
      if (!confirm(question + " Draft history keeps a copy of your draft.")) return;
      draftHistory().add(f.formId, existing);
    }
    writeDraft(kv, f.formId, f.state);
    location.hash = "#" + f.formId;
  };
  const setAsideCount = useSetAsideVersion();
  /** The set-aside count when the notice was last dismissed; a new one shows it again. */
  const [setAsideSeen, setSetAsideSeen] = useState(0);
  const [highlight, setHighlight] = useState(true);
  /** The last output FormView reported, with the form it belongs to (out is null when that template failed to compile). */
  const [output, setOutput] = useState<{ formId: string; out: FormOutput | null } | null>(null);
  /** The open form shows its docket bar (it has a Case number and the active character keeps a docket). */
  const [docketBar, setDocketBar] = useState(false);
  const editorRef = useRef<HTMLElement>(null);

  /* ---------- stores ---------- */

  const charVersion = useCharacterVersion();
  const syncState = useSyncState();
  // Re-read after any character change, and after sync applied a server copy.
  const { characters, activeId } = useMemo(() => {
    const store = characterStore();
    return { characters: store.list(), activeId: store.activeId() };
    // The versions are the change signals; the store is read fresh when either moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the versions are the signals, not values used inside
  }, [charVersion, syncState.applied]);
  const active = useMemo(
    () => (activeId ? characters.find((c) => c.id === activeId) || null : null),
    [characters, activeId],
  );

  // A stale active id (deleted character) reads as none and is cleared.
  useEffect(() => {
    if (activeId && !active) characterStore().setActive(null);
  }, [activeId, active]);

  useEffect(() => {
    // Idempotent (module-level promise), so StrictMode's double effects are harmless; no cleanup.
    void sync.init();
  }, []);

  /* ---------- page changes ---------- */

  // A new page closes the drawer and starts at the top (routing and the title: useRoute).
  // The drawer closes while rendering (not in an effect); the scroll is DOM work, so it stays in one.
  const [navRoute, setNavRoute] = useState(route);
  if (navRoute !== route) {
    setNavRoute(route);
    setNavOpen(false);
  }
  useEffect(() => {
    if (editorRef.current) editorRef.current.scrollTop = 0;
  }, [route, form]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  /* ---------- toolbar actions ---------- */

  const setActive = (id: string | null) => characterStore().setActive(id);

  const onOutput = useCallback((o: FormOutput | null, formId: string) => setOutput({ formId, out: o }), []);
  // Only the leaving form's own output is dropped, so this can't race a newer form's publish.
  const onOutputGone = useCallback((formId: string) => setOutput((p) => (p && p.formId === formId ? null : p)), []);
  // Another form's output (only within the render before FormView's layout effect publishes) shows as empty;
  // null only when this form's template failed to compile (the pane hides).
  const formOutput = form && output && output.formId === form.id ? output.out : EMPTY_OUTPUT;
  // A form whose panel crashed (LP-88) shows no preview, so nothing half-made can be copied.
  const [crashedForm, setCrashedForm] = useState<string | null>(null);
  const formCrashed = !!form && crashedForm === form.id;

  const commissioner = isCommissioner(active);
  const syncOn = !!sync.code();
  const task =
    route.kind === "form" && form
      ? form.title
      : route.kind === "jap"
        ? JAP_TITLE
        : route.kind === "cases"
          ? CASES_TITLE
          : route.kind === "upcoming"
            ? UPCOMING_TITLE
            : route.kind === "intake"
              ? INTAKE_TITLE
              : route.kind === "conflicts"
                ? CONFLICTS_TITLE
                : route.kind === "library"
                  ? LIBRARY_TITLE
                  : APP_TITLE;
  const current = route.kind === "form" ? route.id : route.kind === "home" ? null : route.kind;
  // Deadlines (LP-18): the toolbar dot when the active character has something due within 48 hours.
  const caseVersion = useCaseVersion();
  const today = gameToday();
  const casesDue = useMemo(
    () => (caseVersion >= 0 ? dueSoonCount(caseStore().list(), active ? active.id : null, today) : 0),
    [caseVersion, active, today],
  );
  const showJapOutput = route.kind === "jap" && commissioner && !!active;
  const showOutput = (route.kind === "form" && !!form && formOutput !== null && !formCrashed) || showJapOutput;
  // "Use in form" only for the active character's own docket, into a form that shows the docket bar.
  const canUseDocket = route.kind === "form" && docketBar && !!active && docketsFor === active.id;

  return (
    <>
      <div className={"app-window" + (navOpen ? " nav-open" : "")}>
        <div className="title-bar app-title">
          <span className="title-bar-icon" aria-hidden="true">
            ⚖
          </span>
          <span className="title-bar-text">{APP_TITLE}</span>
          <span className="title-bar-controls" aria-hidden="true">
            <span>_</span>
            <span>□</span>
            <span>✕</span>
          </span>
        </div>
        <Toolbar
          characters={characters}
          activeId={active ? active.id : null}
          onActive={setActive}
          showDockets={hasDocket(active)}
          showJap={commissioner}
          syncStatus={syncOn ? syncState.status : null}
          changelogUnread={changelogUnread}
          navOpen={navOpen}
          onHome={goHome}
          onToggleNav={() => setNavOpen((o) => !o)}
          onDockets={() => openDockets(activeId)}
          onCharacters={() => openCharacters()}
          onChangelog={openChangelog}
          casesDue={casesDue}
        />
        {setAsideCount > setAsideSeen && (
          <div className="set-aside-notice" id="set-aside-notice" role="alert">
            <strong>{S_SET_ASIDE}</strong> {S_SET_ASIDE_HINT}
            <button
              type="button"
              className="mini"
              id="set-aside-dismiss"
              onClick={() => setSetAsideSeen(setAsideCount)}
            >
              Dismiss
            </button>
          </div>
        )}
        {/* "with-output" adds the third grid column (form preview or J.A.P. output). */}
        <div className={"layout" + (showOutput ? " with-output" : "")}>
          <Sidebar forms={ALL_FORMS} current={current} commissioner={commissioner} />
          <main className="editor" id="editor" ref={editorRef}>
            {route.kind === "form" && form ? (
              <ErrorBoundary
                where="this form"
                resetKey={form.id}
                onError={() => setCrashedForm(form.id)}
                onReset={() => setCrashedForm(null)}
              >
                <FormView
                  key={form.id}
                  form={form}
                  activeCharacter={active}
                  highlight={highlight}
                  onOutput={onOutput}
                  onOutputGone={onOutputGone}
                  docketRequest={docketRequest}
                  draftRequest={draftRequest}
                  onDocketBar={setDocketBar}
                />
              </ErrorBoundary>
            ) : route.kind === "jap" ? (
              <ErrorBoundary where="the J.A.P." resetKey={route.kind}>
                <JapView
                  commissioner={commissioner ? active : null}
                  syncOn={syncOn}
                  syncState={syncState}
                  onTurnOnSync={() => openCharacters(true)}
                />
              </ErrorBoundary>
            ) : route.kind === "library" ? (
              <ErrorBoundary where="the Law Library" resetKey={route.kind}>
                <LawLibraryView />
              </ErrorBoundary>
            ) : route.kind === "conflicts" ? (
              <ErrorBoundary where="the conflict check" resetKey={route.kind}>
                <ConflictCheckView characters={characters} active={active} />
              </ErrorBoundary>
            ) : route.kind === "intake" ? (
              <ErrorBoundary where="the intake" resetKey={route.kind}>
                <IntakeView characters={characters} active={active} />
              </ErrorBoundary>
            ) : route.kind === "upcoming" ? (
              <ErrorBoundary where="Upcoming" resetKey={route.kind}>
                <UpcomingView character={active} />
              </ErrorBoundary>
            ) : route.kind === "cases" ? (
              <ErrorBoundary where="the Case File" resetKey={route.caseId}>
                <CaseFileView
                  caseId={route.caseId}
                  characters={characters}
                  activeCharacter={active}
                  onUseFiling={openFiling}
                />
              </ErrorBoundary>
            ) : (
              <EmptyState />
            )}
          </main>
          {route.kind === "form" && form && formOutput && !formCrashed && (
            <ErrorBoundary where="the forum preview" resetKey={form.id}>
              <OutputPane
                form={form}
                finalHtml={formOutput.finalHtml}
                previewHtml={formOutput.previewHtml}
                missing={formOutput.missing}
                onJump={formOutput.jumpTo}
                highlight={highlight}
                onHighlight={setHighlight}
                onFiled={formOutput.onFiled}
                onOpenHistory={openFilings}
              />
            </ErrorBoundary>
          )}
          {showJapOutput && active && (
            <ErrorBoundary where="the J.A.P. output" resetKey={active.id}>
              <JapOutput character={active} />
            </ErrorBoundary>
          )}
        </div>
      </div>
      <Taskbar task={task} onHome={goHome} />
      {/* The DOS-style boot screen (LP-21), over the app once per session. */}
      <BootScreen />
      <datalist id="character-names">
        {characters.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <ErrorBoundary where="the Characters dialog" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <CharactersDialog
          open={dialog === "characters"}
          onClose={closeDialog}
          characters={characters}
          activeId={active ? active.id : null}
          onDockets={(id) => openDockets(id)}
          autoSync={autoSync}
          onAutoSyncDone={autoSyncDone}
        />
      </ErrorBoundary>
      <ErrorBoundary where="the Dockets dialog" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <DocketsDialog
          open={dialog === "dockets"}
          onClose={closeDialog}
          charId={docketsFor}
          canUse={canUseDocket}
          onUse={loadDocketInForm}
        />
      </ErrorBoundary>
      <ErrorBoundary where={"What's new"} variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <ChangelogDialog open={dialog === "changelog"} onClose={closeDialog} />
      </ErrorBoundary>
      <ErrorBoundary where="Filing history" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <FilingsDialog open={dialog === "filings"} onClose={closeDialog} characters={characters} onUse={openFiling} />
      </ErrorBoundary>
    </>
  );
}
