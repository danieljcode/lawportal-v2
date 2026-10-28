// The modern shell (LP-125): a slim app rail (Home and each program the active
// character can see), and a top bar with the program's name, its menus, the
// active character and sync status (LP-109: characters, theme, What's new and
// About live in Settings and the menus; Dockets stays for now). The program's
// own panes fill the rest; the page never scrolls, only the panes do. At phone
// width the rail is a bottom bar and the navigation pane a drawer (☰). Classic
// keeps the Windows 3.x window instead (App.tsx).

import type { MouseEvent, ReactNode } from "react";
import { BRANDING } from "@/branding";
import type { SyncStatus } from "@/lib/sync";
import type { Character } from "@/lib/types";
import MenuBar, { type Menu } from "./MenuBar";
import type { ProgramDef } from "./registry";
import SyncDot from "./SyncDot";

export interface ModernFrameProps {
  programs: readonly ProgramDef[];
  /** Where each program's link goes: back to where it was left (LP-126), or its start. */
  hrefFor(program: ProgramDef): string;
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
  /** What's new has entries not seen yet: a dot on Settings. */
  changelogUnread: boolean;
  showDockets: boolean;
  onDockets(): void;
  onHome(e: MouseEvent): void;
  /** Shown above the program (the set-aside notice). */
  notice?: ReactNode;
  children: ReactNode;
}

export default function ModernFrame(p: ModernFrameProps) {
  const home = !p.program;
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
            href={p.hrefFor(prog)}
            aria-current={p.program?.id === prog.id ? "page" : undefined}
            aria-label={
              prog.id === "control" && p.changelogUnread ? prog.title + " (What's new has new entries)" : undefined
            }
          >
            <span className="m-rail-icon" aria-hidden="true">
              {prog.icon}
            </span>
            <span className="m-rail-label">{prog.title}</span>
            {prog.id === "control" && p.changelogUnread && (
              <span className="changelog-dot" id="changelog-dot" aria-hidden="true" />
            )}
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
            <SyncDot status={p.syncStatus} />
          </div>
        </header>
        {p.notice}
        <div className="m-body">{p.children}</div>
      </div>
    </div>
  );
}
