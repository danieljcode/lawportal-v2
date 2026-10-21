// The modern shell (LP-125): a slim app rail (Home and each program the active
// character can see), and a top bar with the program's name, its menus, the
// active character, sync status and the shell's quick buttons. The program's
// own panes fill the rest; the page never scrolls, only the panes do. At phone
// width the rail is a bottom bar and the navigation pane a drawer (☰). Classic
// keeps the Windows 3.x window instead (App.tsx).

import type { MouseEvent, ReactNode } from "react";
import { BRANDING } from "@/branding";
import { BADGES, type SyncStatus } from "@/lib/sync";
import { ICONS, MODES, themeLabel, type ThemeMode } from "@/lib/theme";
import type { Character } from "@/lib/types";
import MenuBar, { type Menu } from "./MenuBar";
import type { ProgramDef } from "./programs/registry";

export interface ModernFrameProps {
  programs: readonly ProgramDef[];
  /** The open program; null at home. */
  program: ProgramDef | null;
  /** The top bar's heading: the program, or the page inside it. */
  title: string;
  menus: Menu[];
  navOpen: boolean;
  onToggleNav(): void;
  characters: Character[];
  activeId: string | null;
  onActive(id: string | null): void;
  /** Sync status for the dot; null while sync is off on this device. */
  syncStatus: SyncStatus | null;
  changelogUnread: boolean;
  showDockets: boolean;
  onDockets(): void;
  onCharacters(): void;
  onChangelog(): void;
  onAbout(): void;
  theme: ThemeMode;
  onTheme(mode: ThemeMode): void;
  onHome(e: MouseEvent): void;
  /** Shown above the program (the set-aside notice). */
  notice?: ReactNode;
  children: ReactNode;
}

export default function ModernFrame(p: ModernFrameProps) {
  const home = !p.program;
  const themeText = themeLabel(p.theme);
  return (
    <div className={"m-app program-" + (p.program ? p.program.id : "home") + (p.navOpen ? " nav-open" : "")}>
      <nav className="m-rail" aria-label="Programs">
        <a
          className="brand m-rail-item m-rail-home"
          id="rail-home"
          href="./"
          aria-current={home ? "page" : undefined}
          title={BRANDING.firmName + ": home"}
          onClick={p.onHome}
        >
          <span className="m-rail-icon" aria-hidden="true">
            ⌂
          </span>
          <span className="m-rail-label">Home</span>
        </a>
        {p.programs.map((prog) => (
          <a
            key={prog.id}
            className="m-rail-item"
            id={"rail-" + prog.id}
            href={prog.start}
            aria-current={p.program?.id === prog.id ? "page" : undefined}
          >
            <span className="m-rail-icon" aria-hidden="true">
              {prog.icon}
            </span>
            <span className="m-rail-label">{prog.title}</span>
          </a>
        ))}
      </nav>
      <div className="m-main">
        <header className="m-topbar">
          {p.program?.nav && (
            <button
              type="button"
              className="btn icon-btn only-narrow"
              id="toggle-nav"
              aria-label={"Show " + p.program.nav.label}
              aria-expanded={p.navOpen}
              aria-controls={p.program.nav.id}
              onClick={p.onToggleNav}
            >
              ☰
            </button>
          )}
          <h1 className="m-title" id="m-title">
            {p.title}
          </h1>
          <MenuBar menus={p.menus} />
          <div className="m-actions">
            {p.showDockets && (
              <button type="button" className="btn" id="open-dockets" onClick={p.onDockets}>
                Dockets
              </button>
            )}
            <label className="m-char">
              <span className="muted">Filing as</span>
              <select
                id="active-character"
                aria-label="Active character"
                value={p.activeId || ""}
                onChange={(e) => p.onActive(e.target.value || null)}
              >
                <option value="">— no character —</option>
                {p.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name + (c.title ? " (" + c.title + ")" : "")}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" id="open-characters" onClick={p.onCharacters}>
              Characters
              {p.syncStatus && (
                <span
                  className={"sync-dot " + p.syncStatus}
                  id="sync-dot"
                  title={"Sync: " + (BADGES[p.syncStatus] || "on")}
                  role="img"
                  aria-label={"Sync: " + (BADGES[p.syncStatus] || "on")}
                />
              )}
            </button>
            <button
              type="button"
              className="btn icon-btn changelog-btn"
              id="open-changelog"
              aria-label={p.changelogUnread ? "What's new (unread)" : "What's new"}
              title="What's new"
              onClick={p.onChangelog}
            >
              ✎{p.changelogUnread && <span className="changelog-dot" id="changelog-dot" aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="btn icon-btn help-btn"
              id="open-about"
              aria-label="Help: About"
              title="Help: About"
              onClick={p.onAbout}
            >
              ?
            </button>
            <button
              type="button"
              className="btn icon-btn theme-btn"
              id="theme-toggle"
              aria-label={themeText}
              title={themeText}
              onClick={() => p.onTheme(MODES[(MODES.indexOf(p.theme) + 1) % MODES.length])}
            >
              {ICONS[p.theme]}
            </button>
          </div>
        </header>
        {p.notice}
        <div className="m-body">{p.children}</div>
      </div>
    </div>
  );
}
