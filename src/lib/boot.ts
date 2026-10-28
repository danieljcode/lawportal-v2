// The DOS-style boot screen (LP-21): "Friedman & Associates Office System",
// a memory test counting up, drive checks, then C:\>. Shown once per browser
// session, over the app while it loads (so it never holds the app up), for
// under 2 seconds; any key or click skips it, and it can be turned off. With
// reduced motion it shows the finished screen briefly instead. Pure timing
// and wording here; BootScreen.tsx draws it.

import { BRANDING } from "@/branding";

export const BOOT_OFF_KEY = "lawapp_boot_screen";
export const BOOTED_KEY = "lawapp_booted";

/** Memory counted by the memory test, in K: a 4 MB machine. */
export const MEMORY_K = 4096;
/** When each step happens, in milliseconds from the start. */
export const BOOT_TIMES = { memoryEnd: 700, driveA: 850, driveC: 1050, dos: 1250, prompt: 1400, done: 1800 };
/** How long the finished screen shows with reduced motion. */
export const STILL_MS = 700;

/** Safe storage access: private windows and blocked storage just mean no boot screen state. */
function get(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function set(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // storage blocked: the screen just shows again next time
  }
}

const local = () => localStorage;
const session = () => sessionStorage;

/** Whether the boot screen is turned on (the default). */
export function bootEnabled(): boolean {
  return get(local, BOOT_OFF_KEY) !== "off";
}

export function setBootEnabled(on: boolean): void {
  set(local, BOOT_OFF_KEY, on ? null : "off");
}

/** Show it now? Only when it's on and hasn't shown in this browser session. */
export function shouldBoot(): boolean {
  return bootEnabled() && get(session, BOOTED_KEY) !== "1";
}

/** It has shown in this session (also when skipped). */
export function markBooted(): void {
  set(session, BOOTED_KEY, "1");
}

/** The memory counter at `ms` into the boot, rounded to 64K like a real POST. */
export function memoryAt(ms: number): number {
  const k = Math.min(1, Math.max(0, ms / BOOT_TIMES.memoryEnd)) * MEMORY_K;
  return Math.floor(k / 64) * 64;
}

/** The screen's lines at `ms` into the boot (the whole screen once `ms` passes the prompt). */
export function bootLines(ms: number): string[] {
  const t = BOOT_TIMES;
  const lines = [
    BRANDING.firmName + " Office System",
    "BIOS Version 1.02  (C) 1990 " + BRANDING.firmName,
    "",
    "Memory Test: " + memoryAt(ms) + "K" + (ms >= t.memoryEnd ? " OK" : ""),
  ];
  if (ms >= t.driveA) lines.push("", "Detecting drive A: ... 1.44M floppy");
  if (ms >= t.driveC) lines.push("Detecting drive C: ... 40MB fixed disk");
  if (ms >= t.dos) lines.push("", "Starting DOS...");
  if (ms >= t.prompt) lines.push("", "C:\\>");
  return lines;
}
