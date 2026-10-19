// The crash screen's data (LP-88): the error details to copy for a report, and
// the backup to download. Pure apart from reading storage; no DOM.
//
// Error details never carry a sync code or anything typed into a form: only the
// app version, where it broke, the browser, the error's name, its message with
// quoted text and sync codes blanked out, and code locations from the stacks.

import { backupFilename, backupText, isBackedUp, BACKUP_APP, BACKUP_KIND, BACKUP_VERSION } from "./backup";
import type { KV } from "./storage";
import { APP_VERSION } from "./version";

const SYNC_CODE = /JSA(?:-[A-Z0-9]{4}){5}/gi;
/**
 * Quoted text in a message can be someone's input (a value in a parse error, say).
 * A quote opens after a non-letter, so the apostrophe in "can't" isn't one.
 */
const QUOTED = /(^|[^\p{L}\p{N}])(["'`])((?:(?!\2)[^\\\n]|\\.){0,2000}?)\2/gu;
const MAX_MESSAGE = 300;
const MAX_FRAMES = 12;

/** Blank out sync codes and quoted text. */
export function redact(text: string): string {
  return text
    .replace(SYNC_CODE, "[sync code]")
    .replace(QUOTED, (_, before: string, q: string, inner: string) => before + q + (inner ? "…" : "") + q);
}

/** Code locations only: V8's "at …" lines or Firefox's "fn@file:line" lines, without the message line. */
function frames(stack: string | undefined): string[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^at\s/.test(l) || /@\S+:\d+/.test(l))
    .slice(0, MAX_FRAMES)
    .map(redact);
}

/** React's component stack: component names and locations. */
function components(stack: string | null | undefined): string[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_FRAMES)
    .map(redact);
}

export interface CrashInfo {
  error: unknown;
  componentStack?: string | null;
  /** Which part broke ("the form", "the whole app"). */
  where: string;
  userAgent?: string;
  now?: Date;
}

/** The text "Copy error details" puts on the clipboard. */
export function errorDetails({ error, componentStack, where, userAgent, now = new Date() }: CrashInfo): string {
  const err = error instanceof Error ? error : null;
  const name = err ? err.name || "Error" : typeof error;
  let message = redact(err ? err.message : String(error));
  if (message.length > MAX_MESSAGE) message = message.slice(0, MAX_MESSAGE) + "…";
  const lines = [
    "Court Filing Generator " + APP_VERSION + ": error report",
    "Where: " + where,
    "When: " + now.toISOString(),
    "Browser: " + (userAgent || "unknown"),
    "Error: " + name + ": " + message,
  ];
  const f = frames(err?.stack);
  if (f.length) lines.push("", "Stack:", ...f);
  const c = components(componentStack);
  if (c.length) lines.push("", "Components:", ...c);
  return lines.join("\n");
}

/**
 * The crash screen's backup: the full backup (LP-1) when storage can be listed,
 * otherwise the same keys read straight from localStorage. Either restores
 * through Restore backup. Returns the file's text and name.
 */
export function crashBackup(kv: KV, now: Date = new Date()): { text: string; filename: string } {
  const filename = backupFilename(now);
  try {
    return { text: backupText(kv, now), filename };
  } catch {
    const data: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !isBackedUp(key)) continue;
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      }
    } catch {
      // nothing readable: an empty backup still downloads
    }
    const doc = {
      app: BACKUP_APP,
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      created: now.toISOString(),
      appVersion: APP_VERSION,
      data,
    };
    return { text: JSON.stringify(doc, null, 2), filename };
  }
}
