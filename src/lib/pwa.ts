// Turns on the service worker (LP-51, src/lib/serviceWorker.ts) in a built app, and tells the app
// when a new version has installed, with a function that switches to it and reloads.

let started = false;

export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (started || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  started = true;
  const sw = navigator.serviceWorker;
  // On a first visit the worker takes over after the page loaded its files: hand it their addresses to keep.
  if (!sw.controller) {
    sw.addEventListener(
      "controllerchange",
      () =>
        sw.controller?.postMessage({ type: "keep", urls: performance.getEntriesByType("resource").map((e) => e.name) }),
      { once: true },
    );
  }
  const offer = (worker: ServiceWorker) =>
    onUpdate(() => {
      sw.addEventListener("controllerchange", () => location.reload(), { once: true });
      worker.postMessage({ type: "skip-waiting" });
    });
  sw.register("/sw.js")
    .then((reg) => {
      // A worker only counts as an update when one already runs this page.
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && sw.controller) offer(worker);
        });
      });
      // Every route is a hash, so the page never navigates: look for a new version when it's shown again.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
