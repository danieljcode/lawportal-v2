// One date box for every in-game date (LP-159). The browser's own date input draws the real
// 1990 calendar, whose weekdays disagree with game time (LP-135: the real day and weekday, the
// year minus 36). This one shows "Thu 29 Oct 1990", takes a typed date, and opens a calendar of
// the real month under a 1990 heading, on today's game date when empty. It still stores
// YYYY-MM-DD, or YYYY-MM-DDTHH:MM with `withTime` (the custody log).

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  formatDay,
  gameToday,
  MONTH_NAMES,
  monthWeeks,
  pad,
  parseGameDate,
  WEEKDAYS,
} from "@/lib/deadlines";

export interface GameDateInputProps {
  id?: string;
  value: string;
  onChange(value: string): void;
  "aria-label"?: string;
  "aria-describedby"?: string;
  required?: boolean;
  /** A time box too, and a value of "1990-10-20T14:05". */
  withTime?: boolean;
}

const show = (iso: string) => (iso ? formatDay(iso) : "");

/** How far each key moves the focused day in the calendar. */
const STEPS: Record<string, (iso: string) => string> = {
  ArrowLeft: (iso) => addDays(iso, -1),
  ArrowRight: (iso) => addDays(iso, 1),
  ArrowUp: (iso) => addDays(iso, -7),
  ArrowDown: (iso) => addDays(iso, 7),
  Home: (iso) => addDays(iso, -WEEKDAYS.indexOf(formatDay(iso).slice(0, 3))),
  End: (iso) => addDays(iso, 6 - WEEKDAYS.indexOf(formatDay(iso).slice(0, 3))),
  PageUp: (iso) => addMonths(iso, -1),
  PageDown: (iso) => addMonths(iso, 1),
};

export default function GameDateInput({ id, value, onChange, withTime, required, ...aria }: GameDateInputProps) {
  const date = value.slice(0, 10);
  const [text, setText] = useState(() => show(date));
  const [time, setTime] = useState(() => value.slice(11, 16));
  const [invalid, setInvalid] = useState(false);
  // The day the calendar shows and has focused; "" while it's closed.
  const [focus, setFocus] = useState("");
  // The value this box last showed or sent.
  const [seen, setSeen] = useState(value);
  const focusDay = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  // A value set from outside (Today, a reset, another case) replaces what's typed; one this box
  // sent while you type doesn't, so "1990-10-2" isn't rewritten before you reach "29".
  if (value !== seen) {
    setSeen(value);
    setText(show(date));
    setInvalid(false);
    if (value.slice(11, 16)) setTime(value.slice(11, 16));
  }

  const send = (d: string, t = time) => {
    const v = withTime && d ? d + "T" + (t || "00:00") : d;
    setSeen(v);
    onChange(v);
  };

  const type = (t: string) => {
    setText(t);
    setInvalid(false);
    const iso = parseGameDate(t);
    if (iso || !t.trim()) send(iso);
  };

  const tidy = () => {
    const iso = parseGameDate(text);
    if (iso) setText(show(iso));
    setInvalid(!!text.trim() && !iso);
  };

  const open = () => {
    focusDay.current = true;
    setFocus(parseGameDate(text) || date || gameToday());
  };

  const close = () => {
    setFocus("");
    opener.current?.focus();
  };

  const pick = (iso: string) => {
    send(iso);
    setText(show(iso));
    setInvalid(false);
    close();
  };

  useEffect(() => {
    if (!focus) return;
    if (focusDay.current) {
      focusDay.current = false;
      wrap.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
    }
    const outside = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setFocus("");
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [focus]);

  const dayKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    focusDay.current = true;
    setFocus(step(focus));
  };

  const popupKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // Inside a dialog, Esc closes just the calendar.
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  const today = gameToday();
  const y = Number(focus.slice(0, 4));
  const m = Number(focus.slice(5, 7));

  return (
    <span className="game-date" ref={wrap}>
      <input
        id={id}
        type="text"
        className="game-date-text"
        placeholder="e.g. 29 Oct 1990"
        autoComplete="off"
        required={required}
        aria-invalid={invalid || undefined}
        {...aria}
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={tidy}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && e.altKey) {
            e.preventDefault();
            open();
          }
        }}
      />
      <button
        ref={opener}
        type="button"
        className="game-date-open"
        aria-label={"Choose " + (aria["aria-label"] || "date").toLowerCase()}
        aria-haspopup="dialog"
        aria-expanded={!!focus}
        onClick={() => (focus ? close() : open())}
      />
      {withTime && (
        <input
          type="time"
          className="game-date-time"
          aria-label="Time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            if (date) send(date, e.target.value);
          }}
        />
      )}
      {focus && (
        <div className="game-date-pop" role="dialog" aria-labelledby={headingId} onKeyDown={popupKey}>
          <div className="game-date-head">
            <button
              type="button"
              className="mini"
              aria-label="Previous month"
              onClick={() => setFocus(addMonths(focus, -1))}
            >
              ‹
            </button>
            <span id={headingId} aria-live="polite">
              {MONTH_NAMES[m - 1]} {y}
            </span>
            <button
              type="button"
              className="mini"
              aria-label="Next month"
              onClick={() => setFocus(addMonths(focus, 1))}
            >
              ›
            </button>
          </div>
          <table role="grid" aria-labelledby={headingId}>
            <thead>
              <tr>
                {WEEKDAYS.map((d) => (
                  <th key={d} scope="col">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks(y, m).map((week, w) => (
                <tr key={w}>
                  {week.map((day, i) => {
                    if (!day) return <td key={i} />;
                    const iso = `${y}-${pad(m)}-${pad(day)}`;
                    return (
                      <td key={i} aria-selected={iso === date}>
                        <button
                          type="button"
                          data-day={iso}
                          tabIndex={iso === focus ? 0 : -1}
                          aria-label={formatDay(iso)}
                          aria-current={iso === today ? "date" : undefined}
                          onClick={() => pick(iso)}
                          onKeyDown={dayKey}
                        >
                          {day}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}
