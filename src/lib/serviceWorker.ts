// The service worker (LP-51), so the installed app opens without a connection. /sw.js serves this
// function's source with the app's version, so a new version is a new worker: it installs beside
// the old one, the app offers to reload (src/lib/pwa.ts), and its activation drops the old caches.
//
// It must stand alone: the route sends `(serviceWorker)(self, version)` as text, so it uses nothing
// from outside the function.
//
// - The page (every route is a hash on "/"): the network, then the copy from the last visit.
// - The built files under /_next/static (their names change with their contents): the cache first.
// - Anything else of the app's own, such as the manifest and icons: the network, then the cache.
// - /api (sync, which shows its own Offline state) and other sites: left alone.
//
// shortcut: files from older builds of the same version stay cached until the next version
// clears them; prune by age if the cache grows too big.

/** The bits of the worker's global scope this uses, so a test can pass a stand-in. */
export interface WorkerScope {
  location: { origin: string };
  caches: CacheStorage;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  fetch(input: RequestInfo | URL): Promise<Response>;
  addEventListener(type: string, listener: (event: never) => void): void;
}

interface ExtendableEvent {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface MessageEvent extends ExtendableEvent {
  data: unknown;
}

export function serviceWorker(sw: WorkerScope, version: string): void {
  const PREFIX = "lawapp-";
  const CACHE = PREFIX + version;
  const PAGE = "/";

  /** Keeps a good answer to `request` under `key`, and passes it on. */
  function keep(key: Request | string, res: Response): Response {
    if (res.ok) {
      const copy = res.clone();
      sw.caches.open(CACHE).then((c) => c.put(key, copy));
    }
    return res;
  }

  function cached(key: Request | string): Promise<Response> {
    return sw.caches
      .open(CACHE)
      .then((c) => c.match(key))
      .then((r) => r || Response.error());
  }

  sw.addEventListener("install", (e: ExtendableEvent) => {
    e.waitUntil(
      sw.caches
        .open(CACHE)
        .then((c) => c.add(PAGE))
        .catch(() => {}),
    );
  });

  sw.addEventListener("activate", (e: ExtendableEvent) => {
    e.waitUntil(
      sw.caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => sw.caches.delete(k))),
        )
        .then(() => sw.clients.claim()),
    );
  });

  sw.addEventListener("message", (e: MessageEvent) => {
    const data = e.data as { type?: string; urls?: unknown } | null;
    if (!data) return;
    // The user chose to reload into the new version.
    if (data.type === "skip-waiting") e.waitUntil(sw.skipWaiting());
    // On the first visit the page loaded its files before this worker could see them: keep them now.
    if (data.type === "keep" && Array.isArray(data.urls)) {
      const urls = data.urls.filter(
        (u): u is string => typeof u === "string" && u.startsWith(sw.location.origin + "/_next/static/"),
      );
      e.waitUntil(
        sw.caches
          .open(CACHE)
          .then((c) => c.addAll(urls))
          .catch(() => {}),
      );
    }
  });

  sw.addEventListener("fetch", (e: FetchEvent) => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== sw.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/"))
      return;
    if (req.mode === "navigate") {
      e.respondWith(
        sw.fetch(req).then(
          (res) => (url.pathname === PAGE ? keep(PAGE, res) : res),
          () => cached(PAGE),
        ),
      );
    } else if (url.pathname.startsWith("/_next/static/")) {
      e.respondWith(
        cached(req).then((hit) => (hit.type === "error" ? sw.fetch(req).then((res) => keep(req, res)) : hit)),
      );
    } else {
      e.respondWith(
        sw.fetch(req).then(
          (res) => keep(req, res),
          () => cached(req),
        ),
      );
    }
  });
}
