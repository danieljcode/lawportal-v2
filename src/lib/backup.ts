// Full backup and restore (LP-1): one file with everything this browser has
// saved, so switching browsers or clearing the cache loses nothing.
//
// A backup holds every `lawapp_` key as its raw stored string: characters,
// dockets, J.A.P., form drafts, settings (theme, Discord, collapsed sections,
// last form, What's new), set-aside damaged data and kept sync versions. Left
// out: the sync code, and this device's own sync bookkeeping and backup date,
// which mean nothing in another browser.
//
// Restoring replaces everything: the browser ends up exactly as the backup
// was. Old characters-only exports are still accepted, and are imported the
// usual way (merged by id) instead.

import { APP_VERSION } from "./version";
import { SAVE_FAILED, type KV } from "./storage";

export const BACKUP_APP = "jsa-form-generator";
export const BACKUP_KIND = "backup";
export const BACKUP_VERSION = 1;
/** When this browser last made a backup (ISO); for the 30-day reminder. Not itself backed up. */
export const LAST_BACKUP_KEY = "lawapp_backup_last";
export const REMIND_AFTER_DAYS = 30;

const PREFIX = "lawapp_";
/** Device-only keys: the sync code, sync bookkeeping and the backup date. */
const NOT_BACKED_UP = new Set([
  "lawapp_sync_code",
  "lawapp_sync_rev",
  "lawapp_sync_dirty",
  "lawapp_sync_base",
  "lawapp_probe",
  LAST_BACKUP_KEY,
]);

export interface BackupDoc {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  /** ISO time the backup was made. */
  created: string;
  /** The app version that made it. */
  appVersion: string;
  /** Every backed-up key, with its value exactly as stored. */
  data: Record<string, string>;
}

/** What a chosen file turned out to be. */
export type ParsedFile = { kind: "backup"; doc: BackupDoc } | { kind: "characters" };

export function isBackedUp(key: string): boolean {
  return key.startsWith(PREFIX) && !NOT_BACKED_UP.has(key);
}

function keysOf(kv: KV): string[] {
  if (!kv.keys) throw new Error("This browser's storage can't be listed, so it can't be backed up.");
  return kv.keys().filter(isBackedUp).sort();
}

/** Everything backed up from this browser. */
export function makeBackup(kv: KV, now: Date = new Date()): BackupDoc {
  const data: Record<string, string> = {};
  for (const key of keysOf(kv)) {
    const value = kv.get(key);
    if (value !== null) data[key] = value;
  }
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    created: now.toISOString(),
    appVersion: APP_VERSION,
    data,
  };
}

/** `lawapp-backup-YYYY-MM-DD.json`, by the real (not in-game) date. */
export function backupFilename(now: Date = new Date()): string {
  return "lawapp-backup-" + now.toISOString().slice(0, 10) + ".json";
}

/** Make the backup's file text and remember when it was made. */
export function backupText(kv: KV, now: Date = new Date()): string {
  const text = JSON.stringify(makeBackup(kv, now), null, 2);
  try {
    kv.set(LAST_BACKUP_KEY, now.toISOString());
  } catch {
    // the reminder just won't know about this backup
  }
  return text;
}

/** A backup file, an older characters-only export, or a friendly error. */
export function parseFile(text: string): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (o && o.kind === BACKUP_KIND) {
    if (o.version !== BACKUP_VERSION) {
      throw new Error("That backup was made by a newer version of the app. Update the app, then restore it.");
    }
    if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) throw new Error("That backup file is damaged.");
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(o.data as Record<string, unknown>)) {
      if (isBackedUp(key) && typeof value === "string") clean[key] = value;
    }
    return {
      kind: "backup",
      doc: {
        app: BACKUP_APP,
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        created: typeof o.created === "string" ? o.created : "",
        appVersion: typeof o.appVersion === "string" ? o.appVersion : "",
        data: clean,
      },
    };
  }
  if (Array.isArray(data) || (o && Array.isArray(o.characters))) return { kind: "characters" };
  throw new Error("That isn't a backup or a characters file from this app.");
}

export interface Counts {
  characters: number;
  dockets: number;
  portfolios: number;
  drafts: number;
}

function arrayLength(raw: string | undefined): number {
  try {
    const v: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

/** Counts of what a set of stored keys holds, for the restore preview. */
export function countsOf(data: Record<string, string>): Counts {
  const keys = Object.keys(data);
  return {
    characters: arrayLength(data.lawapp_chars),
    dockets: keys.filter((k) => k.startsWith("lawapp_dockets_")).reduce((n, k) => n + arrayLength(data[k]), 0),
    portfolios: keys.filter((k) => k.startsWith("lawapp_jap_")).length,
    drafts: keys.filter((k) => k.startsWith("lawapp_draft_")).length,
  };
}

/** What this browser holds now, as backed-up keys. */
export function currentData(kv: KV): Record<string, string> {
  return makeBackup(kv).data;
}

function readableDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "an unknown date"
    : d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** The question asked before a restore: what changes, and that it can't be undone. */
export function restorePreview(now: Counts, backup: Counts, created: string, syncOn: boolean): string {
  const line = (label: string, a: number, b: number) => `• ${label}: ${a} now → ${b} in the backup`;
  return [
    `Restore the backup from ${readableDate(created)}?`,
    "",
    "This replaces everything saved in this browser:",
    line("Characters", now.characters, backup.characters),
    line("Docket cases", now.dockets, backup.dockets),
    line("J.A.P. portfolios", now.portfolios, backup.portfolios),
    line("Form drafts", now.drafts, backup.drafts),
    "• Settings (theme, Discord, What's new): replaced",
    "",
    syncOn
      ? "Your sync code stays, and the restored data will be sent to the sync server."
      : "Your sync code, if you use one, stays.",
    "This can't be undone, so back up first if you're not sure.",
  ].join("\n");
}

/**
 * Make this browser hold exactly the backup's keys: write each one and remove
 * any backed-up key the backup doesn't have. All or nothing: if storage
 * refuses a write, what was there is put back and SAVE_FAILED is thrown.
 */
export function restoreBackup(kv: KV, doc: BackupDoc): void {
  const before = currentData(kv);
  try {
    for (const [key, value] of Object.entries(doc.data)) kv.set(key, value);
    for (const key of Object.keys(before)) if (!(key in doc.data)) kv.remove(key);
  } catch {
    for (const key of keysOf(kv)) if (!(key in before)) kv.remove(key);
    for (const [key, value] of Object.entries(before)) {
      try {
        kv.set(key, value);
      } catch {
        // best effort: the browser refused this write a moment ago too
      }
    }
    throw new Error(SAVE_FAILED);
  }
  // With sync on, send the restored data next time the app starts.
  if (kv.get("lawapp_sync_code")) {
    try {
      kv.set("lawapp_sync_dirty", "1");
    } catch {
      // the next edit sends it instead
    }
  }
}

/** Days since the last backup, or null if this browser has never made one. */
export function daysSinceBackup(kv: KV, now: Date = new Date()): number | null {
  const last = kv.get(LAST_BACKUP_KEY);
  const t = last ? Date.parse(last) : NaN;
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / 86_400_000);
}

/** The gentle reminder: sync is off, there's something to lose, and no backup in 30 days. */
export function needsBackupReminder(kv: KV, now: Date = new Date()): boolean {
  if (kv.get("lawapp_sync_code")) return false;
  if (countsOf(currentData(kv)).characters === 0) return false;
  const days = daysSinceBackup(kv, now);
  return days === null || days >= REMIND_AFTER_DAYS;
}
