// The window's toolbar: the brand and the quick buttons of the reference topbar (FR6,
// INV §a Topbar). The active character's picker is in the taskbar since LP-103, so
// every program shows it; the theme is the shell's, shared with the View menu.

import type { MouseEvent } from "react";
import { BRANDING } from "@/branding";
import { BADGES, type SyncStatus } from "@/lib/sync";
import { ICONS, MODES, themeLabel, type ThemeMode } from "@/lib/theme";

export interface ToolbarProps {
  /** Dockets button (the active character keeps a docket). */
  showDockets: boolean;
  /** J.A.P. link (the active character is a Court Commissioner). */
  showJap: boolean;
  /** Deadlines due within 48 hours or overdue on the active character's cases (LP-18): a dot on Case File. */
  casesDue?: number;
  /** Sync status for the dot; null while sync is off on this device. */
  syncStatus: SyncStatus | null;
  changelogUnread: boolean;
  navOpen: boolean;
  /** The program has a navigation pane (the ☰ button at phone width). */
  hasNav: boolean;
  theme: ThemeMode;
  onTheme(mode: ThemeMode): void;
  onHome(e: MouseEvent): void;
  onToggleNav(): void;
  onDockets(): void;
  onCharacters(): void;
  onChangelog(): void;
  /** Help → About (LP-22). */
  onAbout(): void;
}

export default function Toolbar(p: ToolbarProps) {
  const theme = p.theme;
  const label = themeLabel(theme);

  return (
    <header className="toolbar">
      {p.hasNav && (
        <button
          type="button"
          className="btn icon-btn only-narrow"
          id="toggle-nav"
          aria-label="Show form list"
          aria-expanded={p.navOpen}
          aria-controls="sidebar"
          onClick={p.onToggleNav}
        >
          ☰
        </button>
      )}
      <a className="brand" href="./" aria-label={BRANDING.productName + " home"} onClick={p.onHome}>
        <span className="brand-mark" aria-hidden="true">
          ⚖
        </span>
        <span className="brand-text">
          <span className="brand-name">{BRANDING.firmName}</span>
          <span className="brand-sub">{BRANDING.productName}</span>
        </span>
      </a>
      <div className="toolbar-sep" aria-hidden="true" />
      <div className="toolbar-actions">
        {p.showDockets && (
          <button type="button" className="btn" id="open-dockets" onClick={p.onDockets}>
            Dockets
          </button>
        )}
        <a
          className="btn"
          id="open-cases"
          href={p.casesDue ? "#cases/upcoming" : "#cases"}
          title={p.casesDue ? p.casesDue + " due within 48 hours: see Upcoming" : "The firm's cases"}
        >
          Case File
          {!!p.casesDue && <span className="changelog-dot due-dot" id="due-dot" aria-label="Something is due soon" />}
        </a>
        {p.showJap && (
          <a className="btn" id="open-jap" href="#jap" title="Judicial Advancement Portfolio">
            J.A.P.
          </a>
        )}
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
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M6 3h9l4 4v14H6z" />
              <path d="M15 3v4h4" />
              <path d="M9 11h7M9 14.5h7M9 18h4" />
            </g>
          </svg>
          {p.changelogUnread && <span className="changelog-dot" id="changelog-dot" aria-hidden="true" />}
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
          aria-label={label}
          title={label}
          onClick={() => p.onTheme(MODES[(MODES.indexOf(theme) + 1) % MODES.length])}
        >
          {ICONS[theme]}
        </button>
      </div>
    </header>
  );
}
