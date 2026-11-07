// The deadline calculator (LP-220): a start date plus a number of days, calendar or weekdays only,
// worked out in game time, and added to the case as a deadline.

import { useState } from "react";
import { cleanDeadline, dueDate, formatDay, gameToday, MAX_COUNT_DAYS } from "@/lib/deadlines";
import type { Deadline } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";

export default function DeadlineCalculator({ onAdd }: { onAdd(d: Deadline): void }) {
  const [start, setStart] = useState(gameToday);
  const [days, setDays] = useState("");
  const [weekdays, setWeekdays] = useState(false);
  const [label, setLabel] = useState("Response due");
  const [error, setError] = useState("");

  const count = /^\d+$/.test(days.trim()) ? Number(days.trim()) : NaN;
  const due = dueDate(start, count, weekdays);

  const add = () => {
    const d =
      due &&
      cleanDeadline({ date: due, label, note: `${count} ${weekdays ? "weekdays" : "days"} after ${formatDay(start)}` });
    if (!d) {
      setError(due ? "Give it a name, like Response due." : "");
      return;
    }
    setError("");
    onAdd(d);
  };

  return (
    <fieldset className="deadline-calc" id="deadline-calc">
      <legend>Calculate a date</legend>
      <div className="deadline-calc-row">
        <label className="field">
          <span className="small">From</span>
          <GameDateInput id="calc-start" aria-label="Start date (in-game)" value={start} onChange={setStart} />
        </label>
        <label className="field">
          <span className="small">Days</span>
          <input
            type="number"
            id="calc-days"
            inputMode="numeric"
            min={0}
            max={MAX_COUNT_DAYS}
            step={1}
            placeholder="14"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="small">Count</span>
          <select
            id="calc-kind"
            value={weekdays ? "weekdays" : "calendar"}
            onChange={(e) => setWeekdays(e.target.value === "weekdays")}
          >
            <option value="calendar">Calendar days</option>
            <option value="weekdays">Weekdays only</option>
          </select>
        </label>
      </div>
      <p className="deadline-calc-result" id="calc-result" aria-live="polite">
        {due ? (
          <>
            Due <strong>{formatDay(due)}</strong>
          </>
        ) : days.trim() ? (
          `Enter a whole number of days, 0 to ${MAX_COUNT_DAYS.toLocaleString("en-US")}.`
        ) : (
          "Enter a number of days."
        )}
      </p>
      {due && (
        <div className="deadline-calc-row">
          <input
            type="text"
            id="calc-label"
            aria-label="What's due"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="button" className="btn" id="calc-add" onClick={add}>
            Add as deadline
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert" id="calc-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
