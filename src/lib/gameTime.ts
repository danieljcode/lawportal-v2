// The game's clock (LP-70). Court names, courthouses and the case-number
// pattern are in courts.ts.
//
// Game time (LP-135) is New York time on every computer, with the year 36 back:
// real Sun 25 Oct 2026, 10 pm in New York, is Sun 25 Oct 1990, 22:00. The day,
// month and weekday are the real ones. Every date and time the app shows or
// fills in comes from gameTime(); callers pass the real instant.

/** Years added to the real year. */
export const YEAR_OFFSET = -36;

export interface GameTime {
  /** The game date, YYYY-MM-DD. */
  date: string;
  /** New York time of day, "HH:MM". */
  time: string;
}

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** New York wall-clock time at `now`, on the game calendar. */
export function gameTime(now: Date = new Date()): GameTime {
  const p: Record<string, string> = {};
  for (const { type, value } of parts.formatToParts(now)) p[type] = value;
  // 36 is a multiple of 4, so a real Feb 29 is a game Feb 29 too.
  const year = String(Number(p.year) + YEAR_OFFSET).padStart(4, "0");
  return { date: `${year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
