// Host allowlist for every API route (design D7).
//
// Unless the app was started with dev:lan / start:lan (which set
// LAWAPP_ALLOW_LAN=1), the API only answers requests addressed to localhost.
// That blocks DNS-rebinding pages, which would otherwise reach 127.0.0.1
// same-origin under their own hostname.

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
  return Response.json({ error: HOST_REFUSED }, { status: 421, headers: { "Cache-Control": "no-store" } });
}
