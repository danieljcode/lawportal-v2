// The taskbar (design D8; LP-103): Start opens the list of programs, the open
// program's button, and the tray with the active character (the same in every
// program) and a clock.

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Character } from "@/lib/types";
import type { ProgramDef } from "./programs/registry";

function clock(d = new Date()): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export interface TaskbarProps {
  /** The programs this character can see, for the Start menu. */
  programs: readonly ProgramDef[];
  /** The open program's id, or null on the start page. */
  current: string | null;
  icon: string;
  task: string;
  characters: Character[];
  activeId: string | null;
  onActive(id: string | null): void;
  onHome(e: MouseEvent): void;
}

export default function Taskbar(p: TaskbarProps) {
  const [time, setTime] = useState(clock);
  const [startOpen, setStartOpen] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(id);
  }, []);

  // A click elsewhere or Esc closes the Start menu.
  useEffect(() => {
    if (!startOpen) return;
    const away = (e: PointerEvent) => {
      if (!startRef.current?.contains(e.target as Node)) setStartOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setStartOpen(false);
      startRef.current?.querySelector<HTMLElement>(".start-btn")?.focus();
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [startOpen]);

  return (
    <footer className="taskbar">
      <div className="start" ref={startRef}>
        <button
          type="button"
          className="start-btn"
          id="start-btn"
          aria-haspopup="menu"
          aria-expanded={startOpen}
          aria-pressed={startOpen}
          title="Open a program"
          onClick={() => setStartOpen((o) => !o)}
        >
          <span className="start-logo" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          Start
        </button>
        {startOpen && (
          <ul className="start-menu" id="start-menu" role="menu" aria-label="Programs">
            {p.programs.map((prog) => (
              <li key={prog.id} role="none">
                <a
                  href={prog.start}
                  role="menuitem"
                  id={"start-" + prog.id}
                  aria-current={p.current === prog.id ? "page" : undefined}
                  onClick={() => setStartOpen(false)}
                >
                  <span className="start-icon" aria-hidden="true">
                    {prog.icon}
                  </span>
                  {prog.title}
                </a>
              </li>
            ))}
            <li className="menu-sep" role="separator" />
            <li role="none">
              <a
                href="./"
                role="menuitem"
                id="start-home"
                onClick={(e) => {
                  setStartOpen(false);
                  p.onHome(e);
                }}
              >
                <span className="start-icon" aria-hidden="true">
                  ⌂
                </span>
                Start page
              </a>
            </li>
          </ul>
        )}
      </div>
      <span className="taskbar-sep" aria-hidden="true" />
      <span className="task-btn" aria-hidden="true">
        <span className="task-icon">{p.icon}</span>
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
