"use client";

// The program shell (LP-103; design §UI components): one program at a time,
// full-screen, around which App draws one of two frames (LP-125): the modern
// shell (ModernFrame: app rail and top bar; the default) or Classic, the
// Windows 3.x window with its title bar and menu bar, the taskbar with Start
// (back to the Program Manager) and the boot screen. Home is the modern home
// screen (ModernHome.tsx, LP-127), or the Program Manager in Classic. The
// programs are in registry.ts; routing is useRoute.ts and the dialogs
// useDialogs.ts (LP-7). Ctrl+K or "/" opens the jump box (JumpBox.tsx, LP-128).

import { Activity, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FORM_INDEX, formInfo } from "@/data/form-index";
import { BRANDING } from "@/branding";
import { characterStore, hasDocket } from "@/lib/characters";
import { caseStore } from "@/lib/cases";
import { dueSoonCount, gameToday } from "@/lib/deadlines";
import { draftHistory, hasContent } from "@/lib/draftHistory";
import type { Filing } from "@/lib/filings";
import type { JumpEntry } from "@/lib/jump";
import { readDraft, writeDraft } from "@/lib/formState";
import { defaultKV, SAVE_FAILED } from "@/lib/storage";
import { isCommissioner } from "@/lib/portfolio";
import * as sync from "@/lib/sync";
import { applyLook, getShell, setShell, type ShellMode } from "@/lib/shell";
import { getTheme, LABELS, MODES, setTheme as saveTheme, type ThemeMode } from "@/lib/theme";
import AboutDialog from "./AboutDialog";
import BootScreen from "./BootScreen";
import ChangelogDialog from "./ChangelogDialog";
import CharactersDialog from "./CharactersDialog";
import DocketsDialog from "./DocketsDialog";
import ErrorBoundary from "@/ui/ErrorBoundary";
import JumpBox, { isFindKey, isJumpKey, jumpShortcut } from "./JumpBox";
import type { DraftRequest, FormTools } from "@/programs/filings";
import MenuBar, { type Menu, type MenuItem } from "./MenuBar";
import ModernFrame from "./ModernFrame";
import ModernHome from "./ModernHome";
import ProgramManager from "./ProgramManager";
import { PROGRAMS, programFor, shown, titleIn } from "./registry";
import type { Shell } from "./program";
import Taskbar from "./Taskbar";
import { S_SAVE_FAILED_HINT, S_SET_ASIDE, S_SET_ASIDE_HINT } from "@/lib/strings";
import { useDialogs } from "./useDialogs";
import { CONTROL_TITLE, hashFor, navigate, pageTitle, SETTINGS_TITLE, useRoute } from "./useRoute";
import {
  useCaseVersion,
  useCharacterVersion,
  useSaveFailedVersion,
  useSetAsideVersion,
  useSyncState,
} from "@/ui/useStore";

export type { DialogName } from "./useDialogs";
export type { Route } from "./useRoute";
import type { Route } from "./useRoute";

// Filing history renders filings with their templates, so its code and the forms load the first
// time it opens (LP-133).
const FilingsDialog = lazy(() => import("@/ui/FilingsDialog"));

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
    markChangelogSeen,
    openAbout,
    openFilings,
    openJump,
    closeDialog,
    autoSyncDone,
    loadDocketInForm,
  } = useDialogs();
  const [navOpen, setNavOpen] = useState(false);
  /** Filing history has been opened, so it stays mounted (and its open/close works as the other dialogs'). */
  const [filingsUsed, setFilingsUsed] = useState(false);
  if (dialog === "filings" && !filingsUsed) setFilingsUsed(true);
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
  /** The theme (LP-112), which picks the frame round the programs (LP-125): modern unless Classic was chosen. */
  const [layout, setLayoutState] = useState<ShellMode>(getShell);
  const setLayout = (mode: ShellMode) => {
    setShell(mode);
    setLayoutState(mode);
  };
  useEffect(() => applyLook(layout), [layout]);

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
    navigate("#filings/" + f.formId);
  };
  const setAsideCount = useSetAsideVersion();
  /** The set-aside count when the notice was last dismissed; a new one shows it again. */
  const [setAsideSeen, setSetAsideSeen] = useState(0);
  const saveFailedCount = useSaveFailedVersion();
  const [saveFailedSeen, setSaveFailedSeen] = useState(0);

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
  // A new page in the same program starts at the top; coming back to a program keeps its place (LP-126).
  const lastProgram = useRef(route.program);
  useEffect(() => {
    const same = lastProgram.current === route.program;
    lastProgram.current = route.program;
    if (!same) return;
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

  // Ctrl+Shift+F (Cmd+Shift+F) opens Find (LP-95) with its box ready to type in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isFindKey(e)) return;
      e.preventDefault();
      navigate("#find");
      setTimeout(() => document.getElementById("find-q")?.focus(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ctrl+K (Cmd+K) anywhere, or "/" outside a field, opens the jump box (LP-128).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isJumpKey(e)) return;
      e.preventDefault();
      openJump();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openJump]);

  /* ---------- the program and its window ---------- */

  const commissioner = isCommissioner(active);
  const syncOn = !!sync.code();
  /** The open program; null at home (the modern home screen, or Classic's Program Manager). */
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

  // In Settings (LP-109), Characters, What's new and About are sections of the page: the menus
  // scroll to them rather than opening the same content again in a dialog.
  const inSettings = program?.id === "control";
  const toSection = (id: string) => document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  const showCharacters = (startSync = false) =>
    inSettings && !startSync ? toSection("settings-characters") : openCharacters(startSync);
  const showChangelog = () => (inSettings ? toSection("settings-changelog") : openChangelog());
  const showAbout = () => (inSettings ? toSection("settings-about") : openAbout());

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
    openCharacters: showCharacters,
    openFilings,
    openFiling,
    openChangelog: showChangelog,
    openAbout: showAbout,
    openDockets: (charId) => openDockets(charId),
    markChangelogSeen,
    theme,
    setTheme,
    layout,
    setLayout,
    visible: true,
  };

  // Each program opened stays mounted, hidden while another is showing, so coming back finds it as
  // it was (LP-126). React's Activity keeps a hidden program's state and DOM but stops its effects,
  // so it does no work in the background; it only re-renders, at low priority, if its data changes.
  const [visited, setVisited] = useState<Partial<Record<string, Route>>>({});
  // Filing as someone else starts every other program afresh, so none shows the last character's work.
  const [visitedFor, setVisitedFor] = useState(activeId);
  if (visitedFor !== activeId) {
    setVisitedFor(activeId);
    setVisited(program ? { [program.id]: route } : {});
  } else if (program && visited[program.id] !== route) {
    setVisited((v) => ({ ...v, [program.id]: route }));
  }
  // The rail and the Program Manager take you back to where each program was left.
  const hrefFor = (p: { id: string; start: string }) => {
    const r = visited[p.id];
    return r ? hashFor(r) || p.start : p.start;
  };
  const shellFor = (id: string, r: Route): Shell =>
    program?.id === id
      ? shell
      : {
          ...shell,
          route: r,
          form: r.program === "filings" && r.formId ? formInfo(r.formId) || null : null,
          navOpen: false,
          visible: false,
        };

  // The jump box's entries (LP-128): the programs the character can see (back to where each was
  // left), their sections, then every court form.
  const visiblePrograms = PROGRAMS.filter((p) => shown(p, { commissioner }));

  // Once the browser is idle, fetch the code of every program this character can open, so opening
  // one is instant (LP-122). A failed fetch is retried when the program is opened.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200));
    const id = idle(() => {
      for (const p of PROGRAMS) if (shown(p, { commissioner })) p.load().catch(() => {});
    });
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id);
  }, [commissioner]);

  const jumpEntries: JumpEntry[] = [
    ...visiblePrograms.map((p): JumpEntry => ({
      id: "program-" + p.id,
      kind: "program",
      label: titleIn(p, layout),
      detail: "",
      href: hrefFor(p),
    })),
    ...visiblePrograms.flatMap((p) =>
      (p.sections || []).map((s, i): JumpEntry => ({
        id: "section-" + p.id + "-" + i,
        kind: "section",
        label: s.label,
        detail: titleIn(p, layout),
        href: s.href,
      })),
    ),
    ...FORM_INDEX.map((f): JumpEntry => ({
      id: "form-" + f.id,
      kind: "form",
      label: f.title,
      detail: [f.court, f.section].filter(Boolean).join(" · "),
      href: "#filings/" + f.id,
    })),
  ];

  // Each program's own File items (its sections), then the shell's.
  const fileItems: MenuItem[] = (program?.sections || []).map((s) => ({ label: s.label, href: s.href }));
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
        { label: "Characters…", id: "menu-characters", onSelect: () => showCharacters() },
        // In every program, so a phone (where the top bar drops its Dockets button) still has it.
        ...(hasDocket(active)
          ? [{ label: "Dockets…", id: "menu-dockets", onSelect: () => openDockets(activeId) }]
          : []),
        // Exit closes the program, back to the Program Manager.
        ...(program ? (["-", { label: "Exit", id: "menu-exit", onSelect: () => goHome() }] as MenuItem[]) : []),
      ],
    },
    ...(program?.id === "filings" ? [formMenu] : []),
    {
      label: "View",
      items: [
        {
          label: "Classic (1990) theme",
          id: "menu-classic",
          checked: layout === "classic",
          onSelect: () => setLayout(layout === "classic" ? "modern" : "classic"),
        },
        "-",
        ...MODES.map((m): MenuItem => ({
          label: LABELS[m],
          id: "menu-theme-" + m,
          checked: theme === m,
          onSelect: () => setTheme(m),
        })),
        { label: layout === "classic" ? CONTROL_TITLE : SETTINGS_TITLE, href: "#control" },
        "-",
        { label: "Jump to… (" + jumpShortcut() + ")", id: "menu-jump", onSelect: openJump },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Contents", id: "menu-help-contents", href: "#help" },
        // Each program's own topic (LP-94), named after it.
        ...(program && program.id !== "help"
          ? [{ label: "Help on " + titleIn(program, layout), id: "menu-help-program", href: "#help/" + program.id }]
          : []),
        "-",
        { label: "What's new", id: "menu-changelog", onSelect: showChangelog },
        { label: "About " + BRANDING.productName, id: "menu-about", onSelect: showAbout },
      ],
    },
  ];

  const windowTitle = (program ? titleIn(program, layout) : "Program Manager") + " - " + BRANDING.firmName;
  const task = program ? pageTitle(route, form) || titleIn(program, layout) : "Program Manager";
  const icon = program ? program.icon : "▦";
  const notice = (
    <>
      {setAsideCount > setAsideSeen && (
        <div className="set-aside-notice" id="set-aside-notice" role="alert">
          <strong>{S_SET_ASIDE}</strong> {S_SET_ASIDE_HINT}
          <button type="button" className="mini" id="set-aside-dismiss" onClick={() => setSetAsideSeen(setAsideCount)}>
            Dismiss
          </button>
        </div>
      )}
      {saveFailedCount > saveFailedSeen && (
        <div className="set-aside-notice" id="save-failed-notice" role="alert">
          <strong>{SAVE_FAILED}</strong> {S_SAVE_FAILED_HINT}
          <button
            type="button"
            className="mini"
            id="save-failed-dismiss"
            onClick={() => setSaveFailedSeen(saveFailedCount)}
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
  const content = (
    <>
      {!program && layout === "modern" && (
        <ErrorBoundary where="the home screen" resetKey="home">
          <ModernHome programs={visiblePrograms} hrefFor={hrefFor} active={active} onOpenFiling={openFiling} />
        </ErrorBoundary>
      )}
      {!program && layout === "classic" && (
        <ErrorBoundary where="the Program Manager" resetKey="home">
          <ProgramManager
            commissioner={commissioner}
            casesDue={casesDue}
            changelogUnread={changelogUnread}
            openChangelog={openChangelog}
            hrefFor={hrefFor}
          />
        </ErrorBoundary>
      )}
      {PROGRAMS.map((p) => {
        const r = program?.id === p.id ? route : visited[p.id];
        if (!r) return null;
        const View = p.View;
        return (
          <Activity key={p.id} mode={program?.id === p.id ? "visible" : "hidden"}>
            <ErrorBoundary where={titleIn(p, layout)} resetKey={p.id} onHome={() => goHome()}>
              <Suspense fallback={<p className="booting">Loading…</p>}>
                <View shell={shellFor(p.id, r)} />
              </Suspense>
            </ErrorBoundary>
          </Activity>
        );
      })}
    </>
  );

  return (
    <>
      {layout === "modern" ? (
        <ModernFrame
          programs={visiblePrograms}
          hrefFor={hrefFor}
          program={program}
          title={program ? task : "Home"}
          menus={menus}
          navOpen={navOpen}
          onToggleNav={() => setNavOpen((o) => !o)}
          characters={characters}
          activeId={active ? active.id : null}
          onActive={(id) => characterStore().setActive(id)}
          syncStatus={syncOn ? syncState.status : null}
          changelogUnread={changelogUnread}
          showDockets={hasDocket(active)}
          onDockets={() => openDockets(activeId)}
          onHome={goHome}
          notice={notice}
        >
          {content}
        </ModernFrame>
      ) : (
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
            {/* The menu bar holds the shell's actions (LP-109); ☰ opens the navigation pane on a phone. */}
            <div className="classic-bar">
              {program?.nav && (
                <button
                  type="button"
                  className="btn icon-btn only-narrow"
                  id="toggle-nav"
                  aria-label={"Show " + program.nav.label}
                  aria-expanded={navOpen}
                  aria-controls={program.nav.id}
                  onClick={() => setNavOpen((o) => !o)}
                >
                  ☰
                </button>
              )}
              <MenuBar menus={menus} />
            </div>
            {notice}
            {content}
          </div>
          <Taskbar
            icon={icon}
            task={task}
            characters={characters}
            activeId={active ? active.id : null}
            onActive={(id) => characterStore().setActive(id)}
            syncStatus={syncOn ? syncState.status : null}
            onHome={goHome}
          />
          {/* The DOS-style boot screen (LP-21), over the app once per session: part of Classic. */}
          <BootScreen />
        </>
      )}
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
      <ErrorBoundary where="the jump box" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        <JumpBox
          open={dialog === "jump"}
          onClose={closeDialog}
          entries={jumpEntries}
          onPick={(e) => navigate(e.href)}
        />
      </ErrorBoundary>
      <ErrorBoundary where="Filing history" variant="dialog" resetKey={dialog} onDismiss={closeDialog}>
        {filingsUsed && (
          <Suspense fallback={null}>
            <FilingsDialog
              open={dialog === "filings"}
              onClose={closeDialog}
              characters={characters}
              onUse={openFiling}
            />
          </Suspense>
        )}
      </ErrorBoundary>
    </>
  );
}
