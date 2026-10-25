// Theme: automatic / light / dark (INV §e.6, design §Theme), set as html[data-theme].
//
// THEME_SCRIPT runs inline in <head> before paint, so a saved choice applies
// without a flash. It also sets html[data-look] from the saved layout (LP-110):
// the look (modern or classic) and light/dark are separate attributes, so they
// combine freely. Nothing here touches `window` at import time (layout.tsx
// imports THEME_SCRIPT on the server).

import { defaultKV } from "./storage";

export const THEME_KEY = "lawapp_theme";

export type ThemeMode = "auto" | "light" | "dark";

/** The choices, in the order Settings and the View menu list them. */
export const MODES: readonly ThemeMode[] = ["auto", "light", "dark"];

export const LABELS: Readonly<Record<ThemeMode, string>> = {
  auto: "automatic (follows your system)",
  light: "light",
  dark: "dark",
};

/** Inline <head> script: apply a saved light/dark choice and the look before the first paint. */
export const THEME_SCRIPT =
  '(function(){var d=document.documentElement;d.dataset.look="modern";try{var t=localStorage.getItem("lawapp_theme");if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("lawapp_shell")==="classic")d.dataset.look="classic"}catch(e){}})();';

function isMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

/** The saved choice; anything unknown reads as auto. */
export function getTheme(): ThemeMode {
  try {
    const v = defaultKV().get(THEME_KEY);
    return isMode(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Set or remove `html[data-theme]` (auto follows prefers-color-scheme). */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

/** Save and apply a choice. A blocked storage still switches for this visit. */
export function setTheme(mode: ThemeMode): void {
  try {
    defaultKV().set(THEME_KEY, mode);
  } catch {
    // private mode: still switch for this visit
  }
  applyTheme(mode);
}
