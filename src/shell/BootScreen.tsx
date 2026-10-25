// The DOS-style boot screen (LP-21), drawn over the app as it loads. Clicks go
// through to the app (pointer-events: none), and any key or click ends it;
// it's decorative, so screen readers skip it. Timing and wording: src/lib/boot.ts.

import { useEffect, useState } from "react";
import { BOOT_TIMES, bootLines, markBooted, shouldBoot, STILL_MS } from "@/lib/boot";

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export default function BootScreen() {
  const [showing, setShowing] = useState(shouldBoot);
  const [still] = useState(reducedMotion);
  // With reduced motion, the finished screen from the start.
  const [ms, setMs] = useState(() => (still ? BOOT_TIMES.done : 0));

  useEffect(() => {
    if (!showing) return;
    markBooted();
    const end = () => setShowing(false);
    const started = Date.now();
    const timers = [setTimeout(end, still ? STILL_MS : BOOT_TIMES.done)];
    // Redraw every 50 ms while animating (a 1990 screen updates in steps anyway).
    const tick = still ? undefined : setInterval(() => setMs(Date.now() - started), 50);
    window.addEventListener("keydown", end);
    window.addEventListener("pointerdown", end);
    return () => {
      timers.forEach(clearTimeout);
      if (tick) clearInterval(tick);
      window.removeEventListener("keydown", end);
      window.removeEventListener("pointerdown", end);
    };
  }, [showing, still]);

  if (!showing) return null;
  const lines = bootLines(ms);
  return (
    <div className="boot-screen" id="boot-screen" aria-hidden="true">
      <pre>
        {lines.join("\n")}
        {ms >= BOOT_TIMES.prompt && <span className="boot-cursor">_</span>}
      </pre>
      <p className="boot-skip">Press any key or click to skip</p>
    </div>
  );
}
