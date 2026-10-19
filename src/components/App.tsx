"use client";

// The app shell (design §UI components): the active character, the output of
// the open form, the narrow-screen drawer and the Win95 window around the three
// panes. Routing is useRoute.ts and the dialogs useDialogs.ts (LP-7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_FORMS } from "@/data";
import { characterStore, hasDocket } from "@/lib/characters";
import { isCommissioner } from "@/lib/portfolio";
import { EMPTY_HTML } from "@/lib/safeHtml";
import * as sync from "@/lib/sync";
import ChangelogDialog from "./ChangelogDialog";
import CharactersDialog from "./CharactersDialog";
import DocketsDialog from "./DocketsDialog";
import EmptyState from "./EmptyState";
import FormView, { type FormOutput } from "./FormView";
import JapOutput from "./JapOutput";
import JapView from "./JapView";
import OutputPane from "./OutputPane";
import Sidebar from "./Sidebar";
import Taskbar from "./Taskbar";
import Toolbar from "./Toolbar";
import { S_SET_ASIDE, S_SET_ASIDE_HINT } from "@/lib/strings";
import { useDialogs } from "./useDialogs";
import { APP_TITLE, JAP_TITLE, useRoute } from "./useRoute";
import { useCharacterVersion, useSetAsideVersion, useSyncState } from "./useStore";

export type { DialogName } from "./useDialogs";
export type { Route } from "./useRoute";

const EMPTY_OUTPUT: FormOutput = { finalHtml: EMPTY_HTML, previewHtml: EMPTY_HTML };

/** One-time data migrations. Each is a no-op once done, so running on every mount is safe. */
function migrate(): void {
  characterStore().migrateLegacy();
  try {
    characterStore().migrateServerField();
  } catch (err) {
    // storage refused the write: the field is ignored anyway, so try again next load
    console.warn("[characters] couldn't drop the old server field", err);
  }
}

export default function App() {
  // Before anything reads the stores, as when it ran in the route's initialiser.
  useState(() => {
    migrate();
    return true;
  });
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
    closeDialog,
    autoSyncDone,
    loadDocketInForm,
  } = useDialogs();
  const [navOpen, setNavOpen] = useState(false);
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
  useEffect(() => {
    setNavOpen(false);
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

  const commissioner = isCommissioner(active);
  const syncOn = !!sync.code();
  const task = route.kind === "form" && form ? form.title : route.kind === "jap" ? JAP_TITLE : APP_TITLE;
  const current = route.kind === "form" ? route.id : route.kind === "jap" ? "jap" : null;
  const showJapOutput = route.kind === "jap" && commissioner && !!active;
  const showOutput = (route.kind === "form" && !!form && formOutput !== null) || showJapOutput;
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
              <FormView
                key={form.id}
                form={form}
                activeCharacter={active}
                highlight={highlight}
                onOutput={onOutput}
                onOutputGone={onOutputGone}
                docketRequest={docketRequest}
                onDocketBar={setDocketBar}
              />
            ) : route.kind === "jap" ? (
              <JapView
                commissioner={commissioner ? active : null}
                syncOn={syncOn}
                syncState={syncState}
                onTurnOnSync={() => openCharacters(true)}
              />
            ) : (
              <EmptyState />
            )}
          </main>
          {route.kind === "form" && form && formOutput && (
            <OutputPane
              form={form}
              finalHtml={formOutput.finalHtml}
              previewHtml={formOutput.previewHtml}
              highlight={highlight}
              onHighlight={setHighlight}
            />
          )}
          {showJapOutput && active && <JapOutput character={active} />}
        </div>
      </div>
      <Taskbar task={task} onHome={goHome} />
      <datalist id="character-names">
        {characters.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <CharactersDialog
        open={dialog === "characters"}
        onClose={closeDialog}
        characters={characters}
        activeId={active ? active.id : null}
        onDockets={(id) => openDockets(id)}
        autoSync={autoSync}
        onAutoSyncDone={autoSyncDone}
      />
      <DocketsDialog
        open={dialog === "dockets"}
        onClose={closeDialog}
        charId={docketsFor}
        canUse={canUseDocket}
        onUse={loadDocketInForm}
      />
      <ChangelogDialog open={dialog === "changelog"} onClose={closeDialog} />
    </>
  );
}
