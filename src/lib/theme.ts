// Light, dark or system (INV §e.6, design §Theme), set as html[data-theme].
//
// THEME_SCRIPT runs inline in <head> before paint, so saved choices apply
// without a flash: light/dark, the theme (html[data-look], modern or classic,
// LP-112) and Classic's readable font (html[data-font]). They are separate
// attributes, so they combine freely. Nothing here touches `window` at import
// time (layout.tsx imports THEME_SCRIPT on the server).

import { defaultKV } from "./storage";

export const THEME_KEY = "lawapp_theme";

export type ThemeMode = "auto" | "light" | "dark";

/** The choices, in the order Settings and the View menu list them. */
export const MODES: readonly ThemeMode[] = ["light", "dark", "auto"];

export const LABELS: Readonly<Record<ThemeMode, string>> = {
  light: "Light",
  dark: "Dark",
  auto: "System",
};

/** Inline <head> script: apply saved light/dark, the theme and the readable font before the first paint. */
export const THEME_SCRIPT =
  '(function(){var d=document.documentElement;d.dataset.look="modern";try{var l=localStorage,t=l.getItem("lawapp_theme");if(t==="light"||t==="dark")d.dataset.theme=t;if(l.getItem("lawapp_shell")==="classic")d.dataset.look="classic";if(l.getItem("lawapp_readable_font")==="1")d.dataset.font="readable"}catch(e){}})();';

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
