// The taskbar (design D8; LP-103, LP-104): Start returns to the Program
// Manager, the open program's icon and name, and the tray with the active
// character (the same in every program) and a clock.

import { useEffect, useState, type MouseEvent } from "react";
import type { Character } from "@/lib/types";

function clock(d = new Date()): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export interface TaskbarProps {
  /** The open program's icon and name ("Program Manager" at home). */
  icon: string;
  task: string;
  characters: Character[];
  activeId: string | null;
  onActive(id: string | null): void;
  onHome(e: MouseEvent): void;
}

export default function Taskbar(p: TaskbarProps) {
  const [time, setTime] = useState(clock);

  useEffect(() => {
    const id = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="taskbar">
      <button type="button" className="start-btn" id="start-btn" title="Back to the Program Manager" onClick={p.onHome}>
        <span className="start-logo" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        Start
      </button>
      <span className="taskbar-sep" aria-hidden="true" />
      <span className="task-btn" id="task-btn">
        <span className="task-icon" aria-hidden="true">
          {p.icon}
        </span>
        <span className="task-title">{p.task}</span>
      </span>
      <span className="tray">
        <label className="char-picker tray-char">
          <span className="muted">Filing as</span>
          <select
            id="active-character"
            aria-label="Active character"
            value={p.activeId || ""}
            onChange={(e) => p.onActive(e.target.value || null)}
          >
            <option value="">— no character —</option>
            {p.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name + (c.title ? " (" + c.title + ")" : "")}
              </option>
            ))}
          </select>
        </label>
        <time className="clock" aria-label={"Time " + time}>
          {time}
        </time>
      </span>
    </footer>
  );
}
