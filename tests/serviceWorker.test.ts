// The service worker (LP-51): the page and its files from the cache when offline, sync left
// alone, old versions' caches dropped, and /sw.js running on its own with the app's version.
import { describe, expect, it, vi } from "vitest";
import { serviceWorker, type WorkerScope } from "@/lib/serviceWorker";
import { GET } from "@/app/sw.js/route";
import manifest from "@/app/manifest";
import { APP_VERSION } from "@/lib/version";

const ORIGIN = "https://app.test";
type Listener = (event: never) => void;

/** A worker scope with an in-memory cache and a network that's on or off. */
function scope() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (k: Request | string) => new URL(typeof k === "string" ? k : k.url, ORIGIN).href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    const cache = {
      put: async (k: Request | string, r: Response) => void store.set(keyOf(k), r),
      match: async (k: Request | string) => store.get(keyOf(k))?.clone(),
      add: async (k: string) => cache.put(k, await net.fetch(k)),
      addAll: async (ks: string[]) => void (await Promise.all(ks.map(cache.add))),
    };
    return cache;
  };
  const net = {
    online: true,
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      if (!net.online) throw new TypeError("Failed to fetch");
      return new Response("from network: " + keyOf(input as Request | string));
    }),
  };
  const listeners = new Map<string, Listener>();
  const sw = {
    location: { origin: ORIGIN },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
    } as unknown as CacheStorage,
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(async () => {}),
    fetch: (i: RequestInfo | URL) => net.fetch(i),
    addEventListener: (type: string, l: Listener) => void listeners.set(type, l),
  } satisfies WorkerScope;

  /** Fires an event and waits for what it handed to waitUntil or respondWith. */
  async function fire(type: string, extra: object = {}): Promise<Response | undefined> {
    let waited: Promise<unknown> = Promise.resolve();
    let answer: Promise<Response> | undefined;
    listeners.get(type)!({
      ...extra,
      waitUntil: (p: Promise<unknown>) => (waited = p),
      respondWith: (p: Promise<Response>) => (answer = p),
    } as never);
    await waited;
    const res = answer && (await answer);
    await new Promise((r) => setTimeout(r)); // the cache write after an answer
    return res;
  }
  const get = (path: string, mode = "cors") => fire("fetch", { request: { method: "GET", url: ORIGIN + path, mode } });
  return { sw, net, stores, fire, get };
}

describe("the service worker", () => {
  it("keeps the page from the last visit and opens it offline, on any route", async () => {
    const s = scope();
    serviceWorker(s.sw, "1.0.0");
    await s.fire("install");
    expect(await (await s.get("/", "navigate"))!.text()).toBe("from network: " + ORIGIN + "/");
    s.net.online = false;
    expect(await (await s.get("/", "navigate"))!.text()).toBe("from network: " + ORIGIN + "/");
    expect((await s.get("/?flags=ledger", "navigate"))!.ok).toBe(true);
  });

  it("serves built files from the cache first, and fetches them only once", async () => {
    const s = scope();
    serviceWorker(s.sw, "1.0.0");
    await s.get("/_next/static/chunks/a.js");
    await s.get("/_next/static/chunks/a.js");
    expect(s.net.fetch).toHaveBeenCalledTimes(1);
    s.net.online = false;
    expect((await s.get("/_next/static/chunks/a.js"))!.ok).toBe(true);
    await expect(s.get("/_next/static/chunks/never-loaded.js")).rejects.toThrow("Failed to fetch");
  });

  it("leaves sync, analytics, other sites and writes to the network", async () => {
    const s = scope();
    serviceWorker(s.sw, "1.0.0");
    expect(await s.get("/api/data")).toBeUndefined();
    expect(await s.get("/_vercel/insights/script.js")).toBeUndefined();
    expect(
      await s.fire("fetch", { request: { method: "GET", url: "https://other.test/x.png", mode: "no-cors" } }),
    ).toBe(undefined);
    expect(await s.fire("fetch", { request: { method: "PUT", url: ORIGIN + "/x", mode: "cors" } })).toBeUndefined();
  });

  it("keeps the files the page loaded before it took over, and only the app's built files", async () => {
    const s = scope();
    serviceWorker(s.sw, "1.0.0");
    const urls = [
      ORIGIN + "/_next/static/chunks/b.js",
      ORIGIN + "/api/data",
      "https://other.test/_next/static/c.js",
      7,
    ];
    await s.fire("message", { data: { type: "keep", urls } });
    expect([...s.stores.get("lawapp-1.0.0")!.keys()]).toEqual([ORIGIN + "/_next/static/chunks/b.js"]);
  });

  it("drops older versions' caches when it takes over, and switches over when asked", async () => {
    const s = scope();
    await s.sw.caches.open("lawapp-0.9.0");
    await s.sw.caches.open("someone-else");
    serviceWorker(s.sw, "1.0.0");
    await s.fire("install");
    await s.fire("activate");
    expect([...s.stores.keys()].sort()).toEqual(["lawapp-1.0.0", "someone-else"]);
    expect(s.sw.clients.claim).toHaveBeenCalled();
    await s.fire("message", { data: { type: "skip-waiting" } });
    expect(s.sw.skipWaiting).toHaveBeenCalled();
  });

  it("is served at /sw.js as a script that runs on its own, with this version", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const s = scope();
    new Function("self", await res.text())(s.sw);
    await s.fire("install");
    expect([...s.stores.keys()]).toEqual(["lawapp-" + APP_VERSION]);
  });
});

describe("the web app manifest", () => {
  it("installs as its own window, with PNG icons the size installers ask for", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons?.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
  });
});
