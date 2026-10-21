// The Control Panel program (LP-103): the settings that belong to the whole
// system, gathered in one place. LP-109 gives each its own panel; for now it
// opens the existing dialogs.

import { useState } from "react";
import { BRANDING } from "@/branding";
import { bootEnabled, setBootEnabled } from "@/lib/boot";
import type { ShellMode } from "@/lib/shell";
import { LABELS, type ThemeMode, MODES } from "@/lib/theme";
import type { ProgramProps } from "./shell";

export default function ControlPanelProgram({ shell }: ProgramProps) {
  const [boot, setBoot] = useState(bootEnabled);
  return (
    <div className="layout no-nav">
      <main className="editor control-panel" id="editor">
        <div className="form-head">
          <div>
            <p className="crumb muted">{BRANDING.firmName}</p>
            <h2 id="control-title">Control Panel</h2>
          </div>
        </div>
        <ul className="control-items">
          <li>
            <button type="button" className="btn" id="control-characters" onClick={() => shell.openCharacters()}>
              Characters and sync
            </button>
            <span className="small muted">Your characters, backups, and syncing across devices.</span>
          </li>
          <li>
            <label className="control-theme">
              <span>Theme</span>
              <select
                id="control-theme"
                value={shell.theme}
                onChange={(e) => shell.setTheme(e.target.value as ThemeMode)}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {LABELS[m][0].toUpperCase() + LABELS[m].slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </li>
          <li>
            {/* Modern or Classic layout (LP-125), until the Classic theme (LP-112) replaces this. */}
            <label className="control-theme">
              <span>Layout</span>
              <select
                id="control-shell"
                value={shell.layout}
                onChange={(e) => shell.setLayout(e.target.value as ShellMode)}
              >
                <option value="modern">Modern</option>
                <option value="classic">Classic (1990): window, taskbar and startup screen</option>
              </select>
            </label>
          </li>
          <li>
            {/* The startup screen (LP-21); it was on the start page until the Program Manager (LP-104). */}
            <label className="check boot-setting">
              <input
                type="checkbox"
                id="boot-setting"
                checked={boot}
                onChange={(e) => {
                  setBootEnabled(e.target.checked);
                  setBoot(e.target.checked);
                }}
              />
              <span>Show the startup screen when the office system starts (once per browser session)</span>
            </label>
          </li>
          <li>
            <button type="button" className="btn" id="control-changelog" onClick={shell.openChangelog}>
              What&apos;s new
            </button>
            <button type="button" className="btn" id="control-about" onClick={shell.openAbout}>
              About
            </button>
          </li>
        </ul>
      </main>
    </div>
  );
}
