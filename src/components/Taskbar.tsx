// The Win95 taskbar (design D8): Start (= home), the current task, a clock.

import { useEffect, useState, type MouseEvent } from "react";

function clock(d = new Date()): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export default function Taskbar({ task, onHome }: { task: string; onHome(e: MouseEvent): void }) {
  const [time, setTime] = useState(clock);

  useEffect(() => {
    const id = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="taskbar">
      <button type="button" className="start-btn" title="Go to the start page" onClick={onHome}>
        <span className="start-logo" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        Start
      </button>
      <span className="taskbar-sep" aria-hidden="true" />
      <span className="task-btn" aria-hidden="true">
        <span className="task-icon">⚖</span>
        <span className="task-title">{task}</span>
      </span>
      <span className="tray">
        <time className="clock" aria-label={"Time " + time}>
          {time}
        </time>
      </span>
    </footer>
  );
}
