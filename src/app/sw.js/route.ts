// GET /sw.js: the service worker (LP-51), from src/lib/serviceWorker.ts with this version in it.
import { serviceWorker } from "@/lib/serviceWorker";
import { APP_VERSION } from "@/lib/version";

const SOURCE = "(" + serviceWorker.toString() + ")(self, " + JSON.stringify(APP_VERSION) + ");\n";

export function GET(): Response {
  return new Response(SOURCE, {
    // no-cache: the browser checks for a new worker on every visit.
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
