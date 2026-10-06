// The main window's toolbar: every control of the reference topbar (FR6, INV §a Topbar).

import { useState, type MouseEvent } from "react";
import type { Character } from "@/lib/types";
import { SERVER_ORDER, SERVERS, type ServerId } from "@/lib/servers";
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
  /** Sync status for the dot; null while sync is off on this device. */
  syncStatus: SyncStatus | null;
  /** The active server id (reflects the active character, or the persisted default). */
  serverId: ServerId;
  onServer(id: ServerId): void;
  changelogUnread: boolean;
  navOpen: boolean;
  onHome(e: MouseEvent): void;
  onToggleNav(): void;
  onDockets(): void;
  onCharacters(): void;
  onChangelog(): void;
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
      <a className="brand" href="./" aria-label="Court Filing Generator home" onClick={p.onHome}>
        <span className="brand-mark" aria-hidden="true">
          ⚖
        </span>
        <span className="brand-text">
          <span className="brand-name">Court Filing Generator</span>
          <span className="brand-sub">San Andreas court filings</span>
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
        <label className="server-picker">
          <span className="muted">Server</span>
          <select
            id="active-server"
            aria-label="Active server"
            value={p.serverId}
            onChange={(e) => p.onServer(e.target.value as ServerId)}
          >
            {SERVER_ORDER.map((sid) => (
              <option key={sid} value={sid}>
                {SERVERS[sid].name}
              </option>
            ))}
          </select>
          <span className="tag" id="server-badge">{SERVERS[p.serverId].name}</span>
        </label>
        {p.showDockets && (
          <button type="button" className="btn" id="open-dockets" onClick={p.onDockets}>
            Dockets
          </button>
        )}
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
