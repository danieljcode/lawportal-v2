// Upcoming (LP-18): what's due in the next 14 days on the active character's
// cases (every firm case with no character), overdue first. Dates are in-game.

import { useMemo } from "react";
import { caseStore } from "@/lib/cases";
import { formatDay, gameToday, relativeDay, upcoming, UPCOMING_DAYS } from "@/lib/deadlines";
import type { Character } from "@/lib/types";
import { useCaseVersion } from "./useStore";

export default function UpcomingView({ character }: { character: Character | null }) {
  const version = useCaseVersion();
  const today = gameToday();
  const items = useMemo(
    () => (version >= 0 ? upcoming(caseStore().list(), character ? character.id : null, today) : []),
    [version, character, today],
  );

  const markDone = (caseId: string, deadlineId: string) => {
    const c = caseStore().get(caseId);
    if (!c) return;
    caseStore().save({ ...c, deadlines: c.deadlines.map((d) => (d.id === deadlineId ? { ...d, done: true } : d)) });
  };

  return (
    <section id="upcoming" className="form-view upcoming">
      <div className="form-head">
        <div>
          <p className="crumb muted">The firm</p>
          <h2 id="upcoming-title">Upcoming</h2>
        </div>
        <div className="form-head-actions">
          <a className="btn" href="#cases">
            Case File
          </a>
        </div>
      </div>
      <p className="small muted" id="upcoming-scope">
        {"Today is " + formatDay(today) + ". The next " + UPCOMING_DAYS + " days on "}
        {character ? character.name + "'s cases" : "every firm case (pick a character under Filing as to see theirs)"}
        {"."}
      </p>
      {items.length ? (
        <ul className="upcoming-list" id="upcoming-list">
          {items.map(({ case: c, deadline: d, overdue, soon }) => (
            <li key={c.id + ":" + d.id} className={"upcoming-item" + (overdue ? " overdue" : soon ? " soon" : "")}>
              <span className="upcoming-when">
                <strong>{formatDay(d.date)}</strong>
                <span className="small">
                  {overdue ? "Overdue, " + relativeDay(d.date, today) : relativeDay(d.date, today)}
                </span>
              </span>
              <span className="upcoming-what">
                <strong>{d.label}</strong>
                <a href={"#cases/" + c.id}>
                  {c.caseNumber}
                  {c.plaintiff || c.defendant ? " · " + [c.plaintiff, c.defendant].filter(Boolean).join(" v. ") : ""}
                </a>
                {d.note && <span className="small muted">{d.note}</span>}
              </span>
              <button type="button" className="mini" onClick={() => markDone(c.id, d.id)}>
                Done
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p id="upcoming-empty">Nothing due in the next {UPCOMING_DAYS} days.</p>
      )}
    </section>
  );
}
