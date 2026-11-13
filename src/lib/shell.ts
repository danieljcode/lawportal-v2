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
/** Classic's CRT mode (LP-58): "1" when on. */
export const CRT_KEY = "lawapp_crt";

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

function getOption(key: string): boolean {
  try {
    return defaultKV().get(key) === "1";
  } catch {
    return false;
  }
}

/** Save a Classic option and apply it as html[data-<attr>]; only the Classic look's stylesheet reads it. */
function setOption(key: string, attr: "font" | "crt", value: string, on: boolean): void {
  try {
    if (on) defaultKV().set(key, "1");
    else defaultKV().remove(key);
  } catch {
    // storage blocked: still switch for this visit
  }
  if (on) document.documentElement.dataset[attr] = value;
  else delete document.documentElement.dataset[attr];
}

export const getReadableFont = () => getOption(READABLE_FONT_KEY);
export const setReadableFont = (on: boolean) => setOption(READABLE_FONT_KEY, "font", "readable", on);
export const getCrt = () => getOption(CRT_KEY);
export const setCrt = (on: boolean) => setOption(CRT_KEY, "crt", "on", on);
