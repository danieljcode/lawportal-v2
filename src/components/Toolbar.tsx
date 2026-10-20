// The main window's toolbar: every control of the reference topbar (FR6, INV §a Topbar).

import { useState, type MouseEvent } from "react";
import { BRANDING } from "@/branding";
import type { Character } from "@/lib/types";
import { BADGES, type SyncStatus } from "@/lib/sync";
import { cycle, getTheme, ICONS, themeLabel, type ThemeMode } from "@/lib/theme";

export interface ToolbarProps {
  characters: Character[];
  activeId: string | null;
  onActive(id: string | null): void;
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
  onHome(e: MouseEvent): void;
  onToggleNav(): void;
  onDockets(): void;
  onCharacters(): void;
  onChangelog(): void;
  /** Help → About (LP-22). */
  onAbout(): void;
}

export default function Toolbar(p: ToolbarProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const label = themeLabel(theme);

  return (
    <header className="toolbar">
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
        <label className="char-picker">
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
        {p.showDockets && (
          <button type="button" className="btn" id="open-dockets" onClick={p.onDockets}>
            Dockets
          </button>
        )}
        <a
          className="btn"
          id="open-cases"
          href={p.casesDue ? "#upcoming" : "#cases"}
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
          onClick={() => setThemeState(cycle(theme))}
        >
          {ICONS[theme]}
        </button>
      </div>
    </header>
  );
}
