"use client";

// The program shell (LP-103; design §UI components): the Program Manager at
// home (LP-104), or one program at a time, full-screen, in a Windows 3.x-style
// window with its own title bar and menu bar; the taskbar with Start (back to
// the Program Manager) and the active character; and the dialogs. The
// programs are in programs/registry.ts; routing is useRoute.ts and the dialogs
// useDialogs.ts (LP-7).

import { useEffect, useMemo, useState } from "react";
import { BRANDING } from "@/branding";
import { characterStore, hasDocket } from "@/lib/characters";
import { caseStore } from "@/lib/cases";
import { dueSoonCount, gameToday } from "@/lib/deadlines";
import { draftHistory, hasContent } from "@/lib/draftHistory";
import type { Filing } from "@/lib/filings";
import { readDraft, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import { isCommissioner } from "@/lib/portfolio";
import * as sync from "@/lib/sync";
import { getTheme, LABELS, MODES, setTheme as saveTheme, type ThemeMode } from "@/lib/theme";
import AboutDialog from "./AboutDialog";
import BootScreen from "./BootScreen";
import ChangelogDialog from "./ChangelogDialog";
import CharactersDialog from "./CharactersDialog";
import DocketsDialog from "./DocketsDialog";
import ErrorBoundary from "./ErrorBoundary";
import FilingsDialog from "./FilingsDialog";
import type { DraftRequest, FormTools } from "./FormView";
import MenuBar, { type Menu, type MenuItem } from "./MenuBar";
import ProgramManager from "./ProgramManager";
import { programFor } from "./programs/registry";
import type { Shell } from "./programs/shell";
import Taskbar from "./Taskbar";
import Toolbar from "./Toolbar";
import { S_SET_ASIDE, S_SET_ASIDE_HINT } from "@/lib/strings";
import { useDialogs } from "./useDialogs";
import { pageTitle, useRoute } from "./useRoute";
import { useCaseVersion, useCharacterVersion, useSetAsideVersion, useSyncState } from "./useStore";

export type { DialogName } from "./useDialogs";
export type { Route } from "./useRoute";

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
    openAbout,
    openFilings,
    closeDialog,
    autoSyncDone,
    loadDocketInForm,
  } = useDialogs();
  const [navOpen, setNavOpen] = useState(false);
  /** Filing history's "Use as new draft" for the form already open (LP-15). */
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);
  /** The open form shows its docket bar (it has a Case number and the active character keeps a docket). */
  const [docketBar, setDocketBar] = useState(false);
  /** The open form's filing tools, for the Form menu (LP-105). */
  const [formTools, setFormTools] = useState<FormTools | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>(getTheme);
  const setTheme = (mode: ThemeMode) => {
    saveTheme(mode);
    setThemeState(mode);
  };

  /**
   * Open a filing as a new draft of its form (LP-15). The open form takes it as an undo step;
   * for another form the draft is replaced (after asking, keeping the old one in draft history)
   * and the form opened.
   */
  const openFiling = (f: Filing) => {
    closeDialog();
    if (route.program === "filings" && route.formId === f.formId) {
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
    location.hash = "#filings/" + f.formId;
  };
  const setAsideCount = useSetAsideVersion();
  /** The set-aside count when the notice was last dismissed; a new one shows it again. */
  const [setAsideSeen, setSetAsideSeen] = useState(0);

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
    const editor = document.getElementById("editor");
    if (editor) editor.scrollTop = 0;
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

  /* ---------- the program and its window ---------- */

  const commissioner = isCommissioner(active);
  const syncOn = !!sync.code();
  /** The open program; null at home, where the Program Manager is. */
  const program = programFor(route);
  // Deadlines (LP-18): Case File's badge in the Program Manager when the active character has something due within 48 hours.
  const caseVersion = useCaseVersion();
  const today = gameToday();
  const casesDue = useMemo(
    () => (caseVersion >= 0 ? dueSoonCount(caseStore().list(), active ? active.id : null, today) : 0),
    [caseVersion, active, today],
  );
  // "Use in form" only for the active character's own docket, into a form that shows the docket bar.
  const canUseDocket = route.program === "filings" && docketBar && !!active && docketsFor === active.id;

  const shell: Shell = {
    route,
    form,
    characters,
    active,
    commissioner,
    navOpen,
    syncOn,
    syncState,
    docketRequest,
    draftRequest,
    onDocketBar: setDocketBar,
    onFormTools: setFormTools,
    openCharacters,
    openFilings,
    openFiling,
    openChangelog,
    openAbout,
    theme,
    setTheme,
  };

  // Each program's own File items, then the shell's (LP-105 to LP-109 add more).
  const own: Partial<Record<string, MenuItem[]>> = {
    filings: hasDocket(active)
      ? [{ label: "Dockets…", id: "menu-dockets", onSelect: () => openDockets(activeId) }]
      : [],
    cases: [
      { label: "All cases", href: "#cases" },
      { label: "Upcoming", href: "#cases/upcoming" },
    ],
    clients: [
      { label: "New client intake", href: "#clients/intake" },
      { label: "Conflict check", href: "#clients/conflicts" },
    ],
    library: [
      { label: "Penal Code", href: "#library/penal-code" },
      { label: "Precedents", href: "#library/precedents" },
    ],
  };
  const fileItems = (program && own[program.id]) || [];
  // Court Filings' Form menu (LP-105): the open form's filing tools.
  const tools = program?.id === "filings" && form ? formTools : null;
  const formMenu: Menu = {
    label: "Form",
    items: [
      { label: "Pick a case…", id: "menu-pick-case", disabled: !tools?.pickCase, onSelect: () => tools?.pickCase?.() },
      {
        label: "Open case in Case File",
        id: "menu-open-case",
        href: tools?.caseId ? "#cases/" + tools.caseId : undefined,
        disabled: !tools?.caseId,
      },
      "-",
      { label: "Law Library…", id: "menu-law-library", disabled: !tools, onSelect: () => tools?.openLibrary() },
      {
        label: "Draft history…",
        id: "menu-draft-history",
        disabled: !tools?.ready,
        onSelect: () => tools?.openDraftHistory(),
      },
      { label: "Filing history…", id: "menu-filing-history", onSelect: openFilings },
    ],
  };
  const menus: Menu[] = [
    {
      label: "File",
      items: [
        ...fileItems,
        ...(fileItems.length ? (["-"] as MenuItem[]) : []),
        { label: "Characters…", id: "menu-characters", onSelect: () => openCharacters() },
        // Exit closes the program, back to the Program Manager.
        ...(program ? (["-", { label: "Exit", id: "menu-exit", onSelect: () => goHome() }] as MenuItem[]) : []),
      ],
    },
    ...(program?.id === "filings" ? [formMenu] : []),
    {
      label: "View",
      items: [
        ...MODES.map((m): MenuItem => ({
          label: "Theme: " + LABELS[m].replace(/ \(.*/, ""),
          id: "menu-theme-" + m,
          checked: theme === m,
          onSelect: () => setTheme(m),
        })),
        "-",
        { label: "Control Panel", href: "#control" },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "What's new", id: "menu-changelog", onSelect: openChangelog },
        { label: "About " + BRANDING.productName, id: "menu-about", onSelect: openAbout },
      ],
    },
  ];

  const windowTitle = (program ? program.title : "Program Manager") + " - " + BRANDING.firmName;
  const task = program ? pageTitle(route, form) || program.title : "Program Manager";
  const icon = program ? program.icon : "▦";
  const View = program?.View;

  return (
    <>
      <div className={"app-window program-" + (program ? program.id : "home") + (navOpen ? " nav-open" : "")}>
        <div className="title-bar app-title">
          <span className="title-bar-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="title-bar-text">{windowTitle}</span>
          <span className="title-bar-controls" aria-hidden="true">
            <span>_</span>
            <span>□</span>
            <span>✕</span>
          </span>
        </div>
        <MenuBar menus={menus} />
        <Toolbar
          showDockets={hasDocket(active)}
          showJap={commissioner}
          syncStatus={syncOn ? syncState.status : null}
          changelogUnread={changelogUnread}
          navOpen={navOpen}
          hasNav={!!program?.nav}
          theme={theme}
          onTheme={setTheme}
          onHome={goHome}
          onToggleNav={() => setNavOpen((o) => !o)}
          onDockets={() => openDockets(activeId)}
          onCharacters={() => openCharacters()}
          onChangelog={openChangelog}
          onAbout={openAbout}
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
        <ErrorBoundary where={program ? program.title : "the Program Manager"} resetKey={program ? program.id : "home"}>
          {View ? (
            <View shell={shell} />
          ) : (
            <ProgramManager
              commissioner={commissioner}
              casesDue={casesDue}
              changelogUnread={changelogUnread}
              openChangelog={openChangelog}
            />
          )}
        </ErrorBoundary>
      </div>
      <Taskbar
        icon={icon}
        task={task}
        characters={characters}
        activeId={active ? active.id : null}
        onActive={(id) => characterStore().setActive(id)}
        onHome={goHome}
      />
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
      <ErrorBoundary where="About" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <AboutDialog open={dialog === "about"} onClose={closeDialog} />
      </ErrorBoundary>
      <ErrorBoundary where="Filing history" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <FilingsDialog open={dialog === "filings"} onClose={closeDialog} characters={characters} onUse={openFiling} />
      </ErrorBoundary>
    </>
  );
}
