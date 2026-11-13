// The screensaver (LP-60): after a set idle time, a 1990-style picture over the
// app until the next mouse move, tap or key. The choices live here; IdleWatch
// (src/shell) watches for idle and Screensaver.tsx draws the pictures.

import { defaultKV } from "./storage";

export const SCREENSAVER_KEY = "lawapp_screensaver";
export const SCREENSAVER_ART_KEY = "lawapp_screensaver_art";

/** Minutes before it starts; 0 is off. */
export const WAITS: readonly number[] = [0, 1, 5, 10, 15, 30];
export const DEFAULT_WAIT = 5;

export type ScreensaverArt = "flying" | "logo";
export const ARTS: readonly ScreensaverArt[] = ["flying", "logo"];

function read(key: string): string | null {
  try {
    return defaultKV().get(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    defaultKV().set(key, value);
  } catch {
    // storage blocked: the choice holds for this visit only
  }
}

/** The saved wait in minutes; anything unknown is the default. */
export function screensaverWait(): number {
  const n = Number(read(SCREENSAVER_KEY) ?? NaN);
  return WAITS.includes(n) ? n : DEFAULT_WAIT;
}

export const setScreensaverWait = (minutes: number) => write(SCREENSAVER_KEY, String(minutes));

export function screensaverArt(): ScreensaverArt {
  return read(SCREENSAVER_ART_KEY) === "logo" ? "logo" : "flying";
}

export const setScreensaverArt = (art: ScreensaverArt) => write(SCREENSAVER_ART_KEY, art);

/** Whether it may start now: never over an open dialog, which may hold unsaved input. */
export function mayStart(doc: Document = document): boolean {
  return !doc.hidden && !doc.querySelector("dialog[open]");
}
