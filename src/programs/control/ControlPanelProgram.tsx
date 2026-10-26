// Settings (LP-109; the Control Panel in the Classic layout): the settings that
// belong to the whole system, on one page. Characters, Sync, What's new and
// About show the same content as their dialogs, which other programs still open.
// Those sections are only drawn while Settings is showing, so a dialog opened
// from another program never doubles their ids.

import { useEffect, useState, type ReactNode } from "react";
import { BRANDING } from "@/branding";
import { bootEnabled, setBootEnabled } from "@/lib/boot";
import { getReadableFont, setReadableFont, type ShellMode } from "@/lib/shell";
import { LABELS, type ThemeMode, MODES } from "@/lib/theme";
import { AboutContent } from "@/shell/AboutDialog";
import { ChangelogList } from "@/shell/ChangelogDialog";
import { CharactersBody } from "@/shell/CharactersDialog";
import type { ProgramProps } from "@/shell/program";
import SyncPanel from "@/shell/SyncPanel";
import { CONTROL_TITLE, SETTINGS_TITLE } from "@/shell/useRoute";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="settings-section" id={id} aria-labelledby={id + "-title"}>
      <h3 id={id + "-title"}>{title}</h3>
      {children}
    </section>
  );
}

export default function ControlPanelProgram({ shell }: ProgramProps) {
  const [boot, setBoot] = useState(bootEnabled);
  const [readable, setReadable] = useState(getReadableFont);
  const { visible, markChangelogSeen } = shell;
  // What's new is on the page, so seeing Settings reads it.
  useEffect(() => {
    if (visible) markChangelogSeen();
  }, [visible, markChangelogSeen]);

  return (
    <div className="layout no-nav">
      <main className="editor control-panel" id={visible ? "editor" : undefined}>
        <div className="form-head">
          <div>
            <p className="crumb muted">{BRANDING.firmName}</p>
            <h2 id="control-title">{shell.layout === "classic" ? CONTROL_TITLE : SETTINGS_TITLE}</h2>
          </div>
        </div>
        {visible && (
          <Section id="settings-characters" title="Characters">
            <CharactersBody
              characters={shell.characters}
              activeId={shell.active ? shell.active.id : null}
              onDockets={shell.openDockets}
              withSync={false}
            />
          </Section>
        )}
        {visible && (
          <Section id="settings-sync" title="Sync">
            <SyncPanel />
          </Section>
        )}
        <Section id="settings-appearance" title="Appearance">
          <ul className="control-items">
            <li>
              <label className="control-theme">
                <span>Theme</span>
                <select
                  id="control-shell"
                  value={shell.layout}
                  onChange={(e) => shell.setLayout(e.target.value as ShellMode)}
                >
                  <option value="modern">Modern</option>
                  <option value="classic">Classic (1990)</option>
                </select>
              </label>
            </li>
            <li>
              <label className="control-theme">
                <span>Light or dark</span>
                <select
                  id="control-theme"
                  value={shell.theme}
                  onChange={(e) => shell.setTheme(e.target.value as ThemeMode)}
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
            {/* Classic's own options (LP-112); Modern has no startup screen to turn off. */}
            {shell.layout === "classic" && (
              <li>
                <label className="check">
                  <input
                    type="checkbox"
                    id="readable-font-setting"
                    checked={readable}
                    onChange={(e) => {
                      setReadableFont(e.target.checked);
                      setReadable(e.target.checked);
                    }}
                  />
                  <span>Use a readable font</span>
                </label>
              </li>
            )}
            {shell.layout === "classic" && (
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
            )}
          </ul>
        </Section>
        {visible && (
          <Section id="settings-changelog" title="What's new">
            <ChangelogList />
          </Section>
        )}
        {visible && (
          <Section id="settings-about" title={"About " + BRANDING.productName}>
            <AboutContent />
          </Section>
        )}
      </main>
    </div>
  );
}
