// The firm's letterhead (LP-23): the name, address, phone and email at the top of
// firm letters, edited in Settings and saved per device (backed up, not synced).
// Templates include it with `{{Letterhead@letterhead}}`; court forms never do,
// because anything posted to the forum must look official (src/branding.ts).

import { BRANDING } from "@/branding";
import { defaultKV, type KV } from "./storage";
import { createStore } from "./store";

export const LETTERHEAD_KEY = "lawapp_letterhead";
const LETTERHEAD_VERSION = 1;
/** Longest value kept for each field. */
export const MAX_LETTERHEAD_FIELD = 300;

export interface Letterhead {
  firmName: string;
  /** One line per address line. */
  address: string;
  phone: string;
  email: string;
}

export const DEFAULT_LETTERHEAD: Letterhead = { firmName: BRANDING.firmName, address: "", phone: "", email: "" };

const text = (v: unknown, fallback: string): string =>
  typeof v === "string" ? v.slice(0, MAX_LETTERHEAD_FIELD) : fallback;

/** Untrusted data → a clean letterhead; a missing or bad field gets its default. */
export function validLetterhead(data: unknown): Letterhead {
  const o = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    firmName: text(o.firmName, DEFAULT_LETTERHEAD.firmName),
    address: text(o.address, DEFAULT_LETTERHEAD.address),
    phone: text(o.phone, DEFAULT_LETTERHEAD.phone),
    email: text(o.email, DEFAULT_LETTERHEAD.email),
  };
}

export function createLetterheadStore(kv: KV) {
  return createStore<Letterhead>(kv, {
    key: LETTERHEAD_KEY,
    version: LETTERHEAD_VERSION,
    validate: validLetterhead,
  });
}

let instance: ReturnType<typeof createLetterheadStore> | null = null;

/** The device's letterhead (created on first use; client only). */
export function letterheadStore(): ReturnType<typeof createLetterheadStore> {
  if (!instance) instance = createLetterheadStore(defaultKV());
  return instance;
}
