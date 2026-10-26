// The theme (LP-112): Modern (app rail and top bar; the default) or Classic
// (1990), the Windows 3.x window, menu bar, taskbar and boot screen from
// LP-103/LP-104/LP-21. It picks both the frame round the programs (LP-125) and
// the look, html[data-look] (LP-110); the programs inside are the same either
// way. Light, dark or system is separate (theme.ts), so any pair works.

import { defaultKV } from "./storage";

export const SHELL_KEY = "lawapp_shell";
export type ShellMode = "modern" | "classic";

/** Classic's "Use a readable font" (LP-112): "1" when ticked. */
export const READABLE_FONT_KEY = "lawapp_readable_font";

/** The saved theme; anything else (or nothing) is modern. */
export function getShell(): ShellMode {
  try {
    return defaultKV().get(SHELL_KEY) === "classic" ? "classic" : "modern";
  } catch {
    return "modern";
  }
}

/** The look goes with the theme: html[data-look]. */
export function applyLook(mode: ShellMode): void {
  document.documentElement.dataset.look = mode;
}

export function setShell(mode: ShellMode): void {
  try {
    if (mode === "classic") defaultKV().set(SHELL_KEY, "classic");
    else defaultKV().remove(SHELL_KEY);
  } catch {
    // storage blocked: the switch still applies for this visit
  }
}

export function getReadableFont(): boolean {
  try {
    return defaultKV().get(READABLE_FONT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Save and apply it as html[data-font]; only the Classic look's stylesheet reads it. */
export function setReadableFont(on: boolean): void {
  try {
    if (on) defaultKV().set(READABLE_FONT_KEY, "1");
    else defaultKV().remove(READABLE_FONT_KEY);
  } catch {
    // storage blocked: still switch for this visit
  }
  if (on) document.documentElement.dataset.font = "readable";
  else delete document.documentElement.dataset.font;
}
