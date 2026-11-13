// Starts the screensaver (LP-60) once the app has been idle for the chosen
// time. Only this small watcher ships with the shell; the screensaver itself
// loads the first time it starts.

import { lazy, Suspense, useEffect, useState } from "react";
import { mayStart, screensaverArt, screensaverWait } from "@/lib/screensaver";

const Screensaver = lazy(() => import("./Screensaver"));

/** How often the idle time is checked. */
export const CHECK_MS = 10_000;
const ACTIVITY = ["pointermove", "pointerdown", "keydown", "wheel", "scroll"] as const;

export default function IdleWatch() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (running) return;
    let last = Date.now();
    const seen = () => {
      last = Date.now();
    };
    for (const e of ACTIVITY) window.addEventListener(e, seen, { capture: true, passive: true });
    // The wait is read on every check, so a change in Settings applies at once.
    const tick = setInterval(() => {
      const wait = screensaverWait();
      if (wait && Date.now() - last >= wait * 60_000 && mayStart()) setRunning(true);
    }, CHECK_MS);
    return () => {
      clearInterval(tick);
      for (const e of ACTIVITY) window.removeEventListener(e, seen, { capture: true });
    };
  }, [running]);

  if (!running) return null;
  return (
    <Suspense fallback={null}>
      <Screensaver art={screensaverArt()} onEnd={() => setRunning(false)} />
    </Suspense>
  );
}
