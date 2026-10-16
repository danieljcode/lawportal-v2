// Server profiles (GTAW / FreestyleRP).
//
// A pure config module: no imports from components. A "server" now bends one
// thing about a filing: the calendar year (FreestyleRP is set 36 years back, so
// a real 2026 reads as 1990 and rolls over to 1991 on the next real New Year).
// The year is applied through getServerDate(), fed into the existing optional
// `now` seam of template.ts / formState.ts.
//
// Court names are FreestyleRP in the form data itself (LP-69, see
// scripts/freestyle-wording.mjs), and courthouses and case numbers live in
// courts.ts (LP-68). LP-70 removes the server choice altogether.

export type ServerId = "gtaw" | "freestyle";

export interface ServerProfile {
  id: ServerId;
  /** The visible label; the only place "GTAW" appears as a word. */
  name: string;
  /** Years added to the real year (0 for gtaw, -36 for freestyle). */
  yearOffset: number;
}

export const SERVERS: Record<ServerId, ServerProfile> = {
  gtaw: { id: "gtaw", name: "GTAW", yearOffset: 0 },
  freestyle: { id: "freestyle", name: "FreestyleRP", yearOffset: -36 },
};

export const SERVER_ORDER: ServerId[] = ["gtaw", "freestyle"];
export const DEFAULT_SERVER: ServerId = "gtaw";

/** The localStorage key for the persisted default server (used when no character is active). */
export const SERVER_KEY = "lawapp_server";

function isServerId(id: unknown): id is ServerId {
  return id === "gtaw" || id === "freestyle";
}

/** The profile for an id; an unknown/absent id falls back to the default (gtaw). */
export function getServer(id: string | undefined | null): ServerProfile {
  return isServerId(id) ? SERVERS[id] : SERVERS[DEFAULT_SERVER];
}

/**
 * The same calendar day shifted by the profile's year offset (UTC). gtaw returns
 * an equivalent date unchanged; freestyle moves the year back 36 (2026 → 1990),
 * so it rolls over with the real New Year (2027-01-01 → 1991). Month and day are
 * preserved; Feb 29 of a leap year that maps to a non-leap year normalises to
 * Mar 1, which is the native Date behaviour we rely on.
 */
export function getServerDate(real: Date, profile: ServerProfile): Date {
  if (!profile.yearOffset) return new Date(real.getTime());
  const d = new Date(real.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + profile.yearOffset);
  return d;
}
