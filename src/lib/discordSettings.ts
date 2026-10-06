// Discord tab settings, per device in localStorage (not synced).

import { defaultKV, readJson, writeJson, type KV } from "./storage";

export const DISCORD_KEY = "lawapp_discord";

export interface DiscordSettings {
  /** Message limit: 2,000 standard, 4,000 with Nitro. */
  limit: 2000 | 4000;
  /** Grid tables as a fixed-width code block, or as plain lines. */
  tables: "code" | "lines";
  /** `-# Part i/n` at the end of each part. */
  markers: boolean;
}

export const DEFAULT_DISCORD: DiscordSettings = { limit: 2000, tables: "code", markers: true };

/** Saved settings; each invalid field falls back to its default, corrupt JSON to all defaults. */
export function readDiscordSettings(kv: KV = defaultKV()): DiscordSettings {
  const raw = readJson<Partial<Record<keyof DiscordSettings, unknown>>>(kv, DISCORD_KEY);
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    limit: s.limit === 2000 || s.limit === 4000 ? s.limit : DEFAULT_DISCORD.limit,
    tables: s.tables === "code" || s.tables === "lines" ? s.tables : DEFAULT_DISCORD.tables,
    markers: typeof s.markers === "boolean" ? s.markers : DEFAULT_DISCORD.markers,
  };
}

/** Save the settings. False when the browser refused the write. */
export function writeDiscordSettings(s: DiscordSettings, kv: KV = defaultKV()): boolean {
  try {
    writeJson(kv, DISCORD_KEY, { limit: s.limit, tables: s.tables, markers: s.markers });
    return true;
  } catch {
    return false;
  }
}
