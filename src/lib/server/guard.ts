// Host allowlist for every API route (design D7).
//
// Unless the app was started with dev:lan / start:lan (which set
// LAWAPP_ALLOW_LAN=1), the API only answers requests addressed to localhost.
// That blocks DNS-rebinding pages, which would otherwise reach 127.0.0.1
// same-origin under their own hostname.

import { json } from "./http";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export const HOST_REFUSED =
  "This server only answers on localhost. Start it with dev:lan or start:lan for other devices.";

/** null when the request may proceed, otherwise the 421 response to return (not logged). */
export function checkHost(req: Request): Response | null {
  if (process.env.LAWAPP_ALLOW_LAN === "1") return null;
  let host = req.headers.get("host");
  if (host === null) {
    try {
      host = new URL(req.url).host;
    } catch {
      host = "";
    }
  }
  if (LOCAL_HOST.test(host)) return null;
  return json({ error: HOST_REFUSED }, 421);
}

export const SYNC_IN_PREVIEW = "Sync isn't available in previews. Use the main app to sync.";

/** checkHost, then a 503 on a Vercel preview deploy (LP-119), so a pull request never reads or writes real sync data. */
export function checkSync(req: Request): Response | null {
  return checkHost(req) ?? (process.env.VERCEL_ENV === "preview" ? json({ error: SYNC_IN_PREVIEW }, 503) : null);
}
