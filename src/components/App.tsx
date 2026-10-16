"use client";

// The app shell (design §UI components): hash routing, last-form restore,
// document.title, active character, dialog flags, the narrow-screen drawer and
// the Win95 window around the three panes.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ALL_FORMS, getForm } from "@/data";
import { isUnread, markSeen } from "@/lib/changelog";
import { characterStore, hasDocket } from "@/lib/characters";
import { LAST_FORM_KEY } from "@/lib/formState";
import { isCommissioner } from "@/lib/portfolio";
import { DEFAULT_SERVER, getServer, SERVER_KEY, type ServerId } from "@/lib/servers";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import ChangelogDialog from "./ChangelogDialog";
import CharactersDialog from "./CharactersDialog";
import DocketsDialog from "./DocketsDialog";
import EmptyState from "./EmptyState";
import FormView, { type DocketRequest, type FormOutput } from "./FormView";
import JapOutput from "./JapOutput";
import JapView from "./JapView";
import OutputPane from "./OutputPane";
import Sidebar from "./Sidebar";
import Taskbar from "./Taskbar";
import Toolbar from "./Toolbar";
import { S_SET_ASIDE, S_SET_ASIDE_HINT } from "@/lib/strings";
import { useCharacterVersion, useSetAsideVersion, useSyncState } from "./useStore";

export type Route = { kind: "home" } | { kind: "form"; id: string } | { kind: "jap" };

/** Which dialog is open (one at a time). */
export type DialogName = "characters" | "dockets" | "changelog" | null;

const APP_TITLE = "Court Filing Generator";
const JAP_TITLE = "Judicial Advancement Portfolio";
const EMPTY_OUTPUT: FormOutput = { finalHtml: "", previewHtml: "" };

function parseRoute(): Route {
  let id = "";
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    id = "";
  }
  if (id === "jap") return { kind: "jap" };
  if (id && getForm(id)) return { kind: "form", id };
  return { kind: "home" };
}

/** Same place: the browser fires popstate and hashchange for one navigation, and both parse alike. */
function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "form" || a.id === (b as { id: string }).id;
}

/**
 * On boot with no hash, reopen the last form (or the J.A.P.), as the reference does. Pure (it runs
 * in render): App writes the restored hash into the URL in a layout effect.
 */
function initialRoute(): Route {
  if (!location.hash) {
    const last = defaultKV().get(LAST_FORM_KEY);
    if (last === "jap") return { kind: "jap" };
    if (last && getForm(last)) return { kind: "form", id: last };
  }
  return parseRoute();
}

let migrated = false;

export default function App() {
  const [route, setRoute] = useState<Route>(() => {
    if (!migrated) {
      migrated = true;
      characterStore().migrateLegacy();
    }
    return initialRoute();
  });
  const [navOpen, setNavOpen] = useState(false);
  const setAsideCount = useSetAsideVersion();
  /** The set-aside count when the notice was last dismissed; a new one shows it again. */
  const [setAsideSeen, setSetAsideSeen] = useState(0);
  const [highlight, setHighlight] = useState(true);
  /** The last output FormView reported, with the form it belongs to (out is null when that template failed to compile). */
  const [output, setOutput] = useState<{ formId: string; out: FormOutput | null } | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  /** Character whose docket the Dockets dialog shows. */
  const [docketsFor, setDocketsFor] = useState<string | null>(null);
  const [changelogUnread, setChangelogUnread] = useState(() => isUnread());
  /** J.A.P. "Turn on sync": the Characters dialog starts sync when it opens. */
  const [autoSync, setAutoSync] = useState(false);
  /** Dockets "Use in form": a docket for the open FormView to load. */
  const [docketRequest, setDocketRequest] = useState<DocketRequest | null>(null);
  /** The open form shows its docket bar (it has a Case number and the active character keeps a docket). */
  const [docketBar, setDocketBar] = useState(false);
  /** Bumped when the persisted default server changes (no character active), to re-read it. */
  const [serverBump, setServerBump] = useState(0);
  const editorRef = useRef<HTMLElement>(null);

  /* ---------- stores ---------- */

  const charVersion = useCharacterVersion();
  const syncState = useSyncState();
  // Re-read after any character change, and after sync applied a server copy.
  const { characters, activeId } = useMemo(() => {
    const store = characterStore();
    return { characters: store.list(), activeId: store.activeId() };
    // The versions are the change signals; the store is read fresh when either moves.
  }, [charVersion, syncState.applied]);
  const active = useMemo(() => (activeId ? characters.find((c) => c.id === activeId) || null : null), [characters, activeId]);

  // Derive the active server: character's server field when selected, otherwise a persisted default.
  const activeServerId: ServerId = useMemo(() => {
    if (active && active.server) return active.server;
    const stored = defaultKV().get(SERVER_KEY);
    return stored === "freestyle" ? "freestyle" : DEFAULT_SERVER;
    // serverBump triggers re-read when the persisted default is toggled (no character active).
  }, [active, serverBump]);
  const server = useMemo(() => getServer(activeServerId), [activeServerId]);

  const onServer = useCallback(
    (id: ServerId) => {
      if (active) {
        characterStore().save({ ...active, server: id });
      } else {
        try {
          defaultKV().set(SERVER_KEY, id);
        } catch {
          // private mode
        }
        setServerBump((n) => n + 1);
      }
    },
    [active],
  );

  // A stale active id (deleted character) reads as none and is cleared.
  useEffect(() => {
    if (activeId && !active) characterStore().setActive(null);
  }, [activeId, active]);

  useEffect(() => {
    // Idempotent (module-level promise), so StrictMode's double effects are harmless; no cleanup.
    void sync.init();
  }, []);

  /* ---------- routing ---------- */

  // A restored last form gets its hash before paint. Not during render: Next's router
  // listens to history updates and would set state while App renders.
  const bootRoute = useRef(route);
  useLayoutEffect(() => {
    const r = bootRoute.current;
    if (!location.hash && r.kind !== "home") history.replaceState(null, "", "#" + (r.kind === "form" ? r.id : "jap"));
  }, []);

  useEffect(() => {
    const onNav = () => {
      const next = parseRoute();
      setRoute((prev) => (sameRoute(prev, next) ? prev : next));
    };
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    return () => {
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
    };
  }, []);

  const form = route.kind === "form" ? getForm(route.id) || null : null;

  useEffect(() => {
    if (route.kind === "home") {
      // The start page forgets the last form, so a refresh stays here.
      defaultKV().remove(LAST_FORM_KEY);
      document.title = APP_TITLE;
    } else if (route.kind === "jap") {
      try {
        defaultKV().set(LAST_FORM_KEY, "jap");
      } catch {
        // private mode
      }
      document.title = JAP_TITLE + " · " + APP_TITLE;
    } else if (form) {
      document.title = form.title + " · " + APP_TITLE;
    }
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

  const goHome = (e: MouseEvent) => {
    e.preventDefault();
    if (location.hash) history.pushState(null, "", location.pathname + location.search);
    setRoute({ kind: "home" });
  };

  /* ---------- toolbar actions ---------- */

  const setActive = (id: string | null) => characterStore().setActive(id);

  const openDockets = (charId: string | null = activeId) => {
    if (!charId) return;
    setDocketsFor(charId);
    setDialog("dockets");
  };

  const openCharacters = (startSync = false) => {
    setAutoSync(startSync);
    setDialog("characters");
  };

  const closeDialog = useCallback(() => setDialog(null), []);
  const autoSyncDone = useCallback(() => setAutoSync(false), []);

  const loadDocketInForm = (docketId: string) => {
    setDialog(null);
    setDocketRequest((r) => ({ docketId, seq: (r ? r.seq : 0) + 1 }));
  };

  const openChangelog = () => {
    markSeen();
    setChangelogUnread(false);
    setDialog("changelog");
  };

  const onOutput = useCallback((o: FormOutput | null, formId: string) => setOutput({ formId, out: o }), []);
  // Only the leaving form's own output is dropped, so this can't race a newer form's publish.
  const onOutputGone = useCallback(
    (formId: string) => setOutput((p) => (p && p.formId === formId ? null : p)),
    [],
  );
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
          serverId={server.id}
          onServer={onServer}
          changelogUnread={changelogUnread}
          navOpen={navOpen}
          onHome={goHome}
          onToggleNav={() => setNavOpen((o) => !o)}
          onDockets={() => openDockets()}
          onCharacters={() => openCharacters()}
          onChangelog={openChangelog}
        />
        {setAsideCount > setAsideSeen && (
          <div className="set-aside-notice" id="set-aside-notice" role="alert">
            <strong>{S_SET_ASIDE}</strong> {S_SET_ASIDE_HINT}
            <button type="button" className="mini" id="set-aside-dismiss" onClick={() => setSetAsideSeen(setAsideCount)}>
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
                server={server}
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
