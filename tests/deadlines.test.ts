// Deadlines and hearing dates (LP-18): the 1990 calendar, what's upcoming and
// overdue, the 48-hour dot, dates taken from a form, and deadlines on cases.
import { describe, expect, it } from "vitest";
import { getForm } from "@/data";
import { cleanCase, unifyCases } from "@/lib/cases";
import {
  addDays,
  addDeadlines,
  cleanDeadline,
  cleanDeadlines,
  dueSoonCount,
  formatDay,
  formDates,
  gameToday,
  relativeDay,
  upcoming,
} from "@/lib/deadlines";
import { compile, fields } from "@/lib/template";
import type { Case, Deadline } from "@/lib/types";

const TODAY = "1990-10-19";
const dl = (date: string, label: string, over: Partial<Deadline> = {}): Deadline => ({
  id: "d" + date.replace(/-/g, "") + label.length,
  date,
  label,
  ...over,
});
const mk = (id: string, deadlines: Deadline[], over: Partial<Case> = {}): Case => ({
  id,
  caseNumber: "90SCCR" + id.slice(-5),
  status: "Open",
  updated: "2026-10-01T00:00:00.000Z",
  created: "2026-10-01T00:00:00.000Z",
  lead: "alice001",
  assigned: [],
  deadlines,

  exhibits: [],
  ...over,
});

describe("the 1990 calendar", () => {
  it("today is the in-game date", () => {
    expect(gameToday(new Date(2026, 9, 19, 12, 0))).toBe("1990-10-19");
  });

  it("formats a day with 1990's own weekday", () => {
    expect(formatDay("1990-10-19")).toBe("Fri 19 Oct 1990");
    expect(formatDay("1990-12-25")).toBe("Tue 25 Dec 1990");
  });

  it("adds days across months and years, and says how far away a day is", () => {
    expect(addDays("1990-12-30", 3)).toBe("1991-01-02");
    expect(addDays("1990-03-01", -1)).toBe("1990-02-28");
    expect(relativeDay("1990-10-19", TODAY)).toBe("today");
    expect(relativeDay("1990-10-20", TODAY)).toBe("tomorrow");
    expect(relativeDay("1990-10-25", TODAY)).toBe("in 6 days");
    expect(relativeDay("1990-10-18", TODAY)).toBe("yesterday");
    expect(relativeDay("1990-10-14", TODAY)).toBe("5 days ago");
  });
});

describe("deadlines on a case", () => {
  it("need a date and a label; notes and done are kept", () => {
    expect(cleanDeadline({ date: "19/10/1990", label: "Hearing" })).toBeNull();
    expect(cleanDeadline({ date: "1990-10-19", label: " " })).toBeNull();
    expect(
      cleanDeadline({ id: "abcd1234", date: "1990-10-19", label: " Hearing ", note: "Room 2", done: true }),
    ).toEqual({
      id: "abcd1234",
      date: "1990-10-19",
      label: "Hearing",
      note: "Room 2",
      done: true,
    });
  });

  it("are kept soonest first on a case, and both copies' survive a merge", () => {
    const c = cleanCase({
      caseNumber: "90SCCR00001",
      deadlines: [dl("1990-11-02", "Judgement"), dl("1990-10-25", "Openings")],
    });
    expect(c.deadlines.map((d) => d.label)).toEqual(["Openings", "Judgement"]);
    expect(cleanDeadlines("nope")).toEqual([]);
    const [one] = unifyCases(
      [
        mk("aaaa0001", [dl("1990-10-25", "Openings")], {
          caseNumber: "90SCCR00001",
          updated: "2026-10-02T00:00:00.000Z",
        }),
      ],
      [mk("bbbb0002", [dl("1990-11-02", "Judgement")], { caseNumber: "90SCCR00001" })],
    );
    expect(one.deadlines.map((d) => d.label)).toEqual(["Openings", "Judgement"]);
  });

  it("adding dates skips ones already there", () => {
    const list = addDeadlines(
      [dl("1990-11-09", "Judgement")],
      [
        { date: "1990-11-09", label: "judgement" },
        { date: "1990-11-07", label: "Closing arguments end" },
      ],
    );
    expect(list.map((d) => d.label)).toEqual(["Closing arguments end", "Judgement"]);
  });
});

describe("upcoming", () => {
  const cases = [
    mk("case0001", [
      dl("1990-10-17", "Response due"), // overdue
      dl("1990-10-20", "Hearing"), // tomorrow: soon
      dl("1990-10-30", "Openings"), // in 11 days
      dl("1990-11-10", "Judgement"), // past 14 days
      dl("1990-10-18", "Filed", { done: true }), // done
    ]),
    mk("case0002", [dl("1990-10-21", "Trial")], { lead: "bob00001" }),
    mk("case0003", [dl("1990-10-22", "Closings")], { lead: null, assigned: ["alice001"] }),
  ];

  it("lists the next 14 days on the character's cases, overdue first, done ones left out", () => {
    const items = upcoming(cases, "alice001", TODAY);
    expect(items.map((i) => i.deadline.label)).toEqual(["Response due", "Hearing", "Closings", "Openings"]);
    expect(items.map((i) => [i.overdue, i.soon])).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [false, false],
    ]);
  });

  it("with no character, every firm case", () => {
    expect(upcoming(cases, null, TODAY).map((i) => i.deadline.label)).toContain("Trial");
  });

  it("the toolbar dot counts what's due within 48 hours or overdue", () => {
    expect(dueSoonCount(cases, "alice001", TODAY)).toBe(2);
    expect(dueSoonCount(cases, "bob00001", TODAY)).toBe(1);
    expect(dueSoonCount(cases, "carol001", TODAY)).toBe(0);
  });
});

describe("dates from a form", () => {
  it("lists a case schedule's filled dates, suggesting the computed ones", () => {
    const form = getForm("criminal-case-schedule")!;
    const entries = fields(compile(form.html));
    const values = {
      "Filing date": "1990-10-19",
      Judgement: "1990-11-09",
      "Closing arguments end": "1990-11-07",
      "Opening arguments start": "",
    };
    const dates = formDates(entries, values);
    expect(dates).toEqual([
      { label: "Filing date", date: "1990-10-19", suggested: false },
      { label: "Closing arguments end", date: "1990-11-07", suggested: true },
      { label: "Judgement", date: "1990-11-09", suggested: true },
    ]);
  });
});
