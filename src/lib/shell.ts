// Which layout wraps the programs (LP-125): the modern shell (app rail and top
// bar; the default) or Classic, the Windows 3.x window, menu bar, taskbar and
// boot screen from LP-103/LP-104/LP-21. A temporary setting until the Classic
// theme (LP-112) chooses it; the programs inside are the same either way.

import { defaultKV } from "./storage";

export const SHELL_KEY = "lawapp_shell";
export type ShellMode = "modern" | "classic";

/** The saved layout; anything else (or nothing) is modern. */
export function getShell(): ShellMode {
  try {
    return defaultKV().get(SHELL_KEY) === "classic" ? "classic" : "modern";
  } catch {
    return "modern";
  }
}

/** The look follows the layout (LP-110), until the Classic theme (LP-112) chooses it: html[data-look]. */
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
