// The month calendar (LP-231, #cases/calendar): a game month of open deadlines,
// hearings and dated next actions, coloured by kind; each opens its case.
// Previous / Next month and Today move it; My work or All firm picks whose.
// At phone width the grid becomes a day-by-day list (CSS shows one or the other).

import { useMemo, useState } from "react";
import { KIND_NAMES, monthEntries, type CalendarEntry } from "@/lib/calendar";
import { caseStore } from "@/lib/cases";
import { addMonths, formatDay, gameToday, MONTH_NAMES, monthWeeks, WEEKDAYS } from "@/lib/deadlines";
import type { Character } from "@/lib/types";
import { useCaseVersion } from "@/ui/useStore";

const pad = (n: number) => String(n).padStart(2, "0");

function Entry({ e }: { e: CalendarEntry }) {
  return (
    <li className={"cal-entry cal-" + e.kind}>
      <a href={"#cases/" + e.case.id} title={KIND_NAMES[e.kind] + ": " + e.title + " (" + e.case.caseNumber + ")"}>
        <span className="sr-only">{KIND_NAMES[e.kind] + ": "}</span>
        {e.title}
        <span className="cal-case">{e.case.caseNumber}</span>
      </a>
    </li>
  );
}

export default function CalendarView({ character }: { character: Character | null }) {
  const version = useCaseVersion();
  const today = gameToday();
  // Any day of the month shown; addMonths keeps it inside the month.
  const [day, setDay] = useState(today);
  const [firmWide, setFirmWide] = useState(false);
  const month = day.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const charId = character && !firmWide ? character.id : null;
  const byDay = useMemo(
    () => (version >= 0 ? monthEntries(caseStore().list(), charId, month) : new Map<string, CalendarEntry[]>()),
    [version, charId, month],
  );
  const dateOf = (d: number) => month + "-" + pad(d);
  const title = MONTH_NAMES[m - 1] + " " + y;

  return (
    <section id="calendar" className="form-view calendar" aria-labelledby="calendar-title">
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="calendar-title">Calendar</h2>
        </div>
        <div className="form-head-actions">
          <a className="btn" href="#cases/upcoming">
            Upcoming
          </a>
        </div>
      </div>
      <div className="row cal-bar">
        <button type="button" className="btn" id="cal-prev" onClick={() => setDay(addMonths(day, -1))}>
          ‹ Previous
        </button>
        <h3 className="cal-month" id="cal-month" aria-live="polite">
          {title}
        </h3>
        <button type="button" className="btn" id="cal-next" onClick={() => setDay(addMonths(day, 1))}>
          Next ›
        </button>
        <button type="button" className="btn" id="cal-today" onClick={() => setDay(today)}>
          Today
        </button>
        {character && (
          <span className="home-scope" role="group" aria-label="Whose work">
            {[false, true].map((firm) => (
              <button
                key={String(firm)}
                type="button"
                className="mini"
                id={firm ? "cal-scope-firm" : "cal-scope-mine"}
                aria-pressed={firmWide === firm}
                onClick={() => setFirmWide(firm)}
              >
                {firm ? "All firm" : "My work"}
              </button>
            ))}
          </span>
        )}
      </div>
      <p className="small muted cal-legend" id="cal-scope">
        {"Today is " +
          formatDay(today) +
          ". Showing " +
          (charId ? character!.name + "'s work" : "all firm work") +
          ": "}
        {(["hearing", "deadline", "action"] as const).map((k) => (
          <span key={k} className={"cal-key cal-" + k}>
            {KIND_NAMES[k]}
          </span>
        ))}
      </p>

      <table className="cal-grid" id="cal-grid" aria-label={title}>
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(y, m).map((week, i) => (
            <tr key={i}>
              {week.map((d, j) => {
                if (!d) return <td key={j} className="cal-pad" />;
                const date = dateOf(d);
                const entries = byDay.get(date) || [];
                return (
                  <td key={j} className={date === today ? "cal-today" : undefined} data-date={date}>
                    <span className="cal-day" aria-label={formatDay(date)}>
                      {d}
                    </span>
                    {entries.length > 0 && (
                      <ul className="cal-entries">
                        {entries.map((e) => (
                          <Entry key={e.key} e={e} />
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cal-list" id="cal-list">
        {byDay.size ? (
          [...byDay].map(([date, entries]) => (
            <section key={date} className={date === today ? "cal-today" : undefined} aria-label={formatDay(date)}>
              <h4>{formatDay(date) + (date === today ? " (today)" : "")}</h4>
              <ul className="cal-entries">
                {entries.map((e) => (
                  <Entry key={e.key} e={e} />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="muted">Nothing due in {title}.</p>
        )}
      </div>
    </section>
  );
}
