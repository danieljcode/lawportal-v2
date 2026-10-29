// @vitest-environment jsdom
// The game date picker (LP-159): the 1990 calendar drawn from the real year, so weekdays match
// game time (LP-135), typed dates, and the GameDateInput box itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { addMonths, formatDay, MONTH_NAMES, monthWeeks, pad, parseGameDate, WEEKDAYS } from "@/lib/deadlines";
import GameDateInput from "@/ui/GameDateInput";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The column (0 = Monday) a day sits in. */
const column = (year: number, month: number, day: number) =>
  monthWeeks(year, month)
    .find((w) => w.includes(day))!
    .indexOf(day);

describe("the 1990 calendar", () => {
  it("puts 29 Oct 1990 under Thursday, as 29 Oct 2026 is", () => {
    expect(monthWeeks(1990, 10)[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(WEEKDAYS[column(1990, 10, 29)]).toBe("Thu");
  });

  it("puts every day of every month under its real weekday, the same as formatDay", () => {
    for (let m = 1; m <= 12; m++) {
      for (const week of monthWeeks(1990, m)) {
        expect(week).toHaveLength(7);
        week.forEach((day, i) => {
          if (day) expect(formatDay(`1990-${pad(m)}-${pad(day)}`).slice(0, 3)).toBe(WEEKDAYS[i]);
        });
      }
    }
  });

  it("has 29 Feb in a leap year, under the real weekday (1988 is 2024)", () => {
    expect(monthWeeks(1988, 2).flat()).toContain(29);
    expect(WEEKDAYS[column(1988, 2, 29)]).toBe("Thu");
    expect(formatDay("1988-02-29")).toBe("Thu 29 Feb 1988");
    expect(monthWeeks(1990, 2).flat()).not.toContain(29);
  });

  it("steps whole months, keeping the day inside the month", () => {
    expect(addMonths("1990-10-29", 1)).toBe("1990-11-29");
    expect(addMonths("1990-01-31", 1)).toBe("1990-02-28");
    expect(addMonths("1988-01-31", 1)).toBe("1988-02-29");
    expect(addMonths("1990-12-15", 1)).toBe("1991-01-15");
    expect(addMonths("1990-01-15", -1)).toBe("1989-12-15");
  });

  it("reads typed dates, and nothing else", () => {
    for (const text of ["1990-10-29", "29/10/1990", "29 Oct 1990", "Thu 29 October 1990", " 29 oct. 1990 "]) {
      expect(parseGameDate(text)).toBe("1990-10-29");
    }
    for (const text of ["", "hello", "29 Oct", "30 Feb 1990", "1990-13-01", "29 Ju 1990", "0990-10-29"]) {
      expect(parseGameDate(text)).toBe("");
    }
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let changes: string[] = [];

function Harness({ initial, withTime }: { initial: string; withTime?: boolean }) {
  const [value, setValue] = useState(initial);
  return createElement(
    "div",
    null,
    createElement(GameDateInput, {
      id: "d",
      "aria-label": "Date",
      value,
      withTime,
      onChange: (v: string) => {
        changes.push(v);
        setValue(v);
      },
    }),
    createElement("button", { id: "reset", type: "button", onClick: () => setValue("1990-01-02") }),
  );
}

function mount(initial = "", withTime = false): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(Harness, { initial, withTime })));
}

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function type(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
const click = (sel: string) => act(() => must(sel).click());
const text = () => must<HTMLInputElement>("#d");
const heading = () => must(".game-date-head span").textContent;

describe("GameDateInput (LP-159)", () => {
  beforeEach(() => {
    changes = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T16:00:00Z")); // Thu 29 Oct 1990, noon in New York
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.useRealTimers();
  });

  it("opens an empty box on today's game date, marked, under Thursday", () => {
    mount();
    click(".game-date-open");
    expect(must(".game-date-open").getAttribute("aria-expanded")).toBe("true");
    expect(heading()).toBe("October 1990");
    const today = must<HTMLButtonElement>('[aria-current="date"]');
    expect(today.textContent).toBe("29");
    expect(today.getAttribute("aria-label")).toBe("Thu 29 Oct 1990");
    expect((today.parentElement as HTMLTableCellElement).cellIndex).toBe(WEEKDAYS.indexOf("Thu"));
    expect(document.activeElement).toBe(today);
    expect(changes).toEqual([]);
  });

  it("shows a saved date the app's way and opens on it", () => {
    mount("1990-03-05");
    expect(text().value).toBe(formatDay("1990-03-05"));
    click(".game-date-open");
    expect(heading()).toBe("March 1990");
    expect(must('td[aria-selected="true"] button').textContent).toBe("5");
  });

  it("picks a day with the keys, and stores it as YYYY-MM-DD", () => {
    mount();
    click(".game-date-open");
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement!.getAttribute("data-day")).toBe("1990-10-30");
    key(document.activeElement!, "PageDown");
    expect(heading()).toBe(MONTH_NAMES[10] + " 1990");
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement!.getAttribute("data-day")).toBe("1990-11-23");
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(changes).toEqual(["1990-11-23"]);
    expect(text().value).toBe("Mon 23 Nov 1990");
    expect(document.querySelector(".game-date-pop")).toBeNull();
    expect(document.activeElement).toBe(must(".game-date-open"));
  });

  it("closes on Esc without picking", () => {
    mount("1990-10-01");
    click(".game-date-open");
    key(document.activeElement!, "Escape");
    expect(document.querySelector(".game-date-pop")).toBeNull();
    expect(changes).toEqual([]);
  });

  it("takes a typed date, tidies it on leaving, and flags one it can't read", () => {
    mount();
    type("#d", "29/10/1990");
    expect(changes).toEqual(["1990-10-29"]);
    expect(text().value).toBe("29/10/1990"); // not rewritten while typing
    act(() => text().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(text().value).toBe("Thu 29 Oct 1990");
    type("#d", "next Tuesday");
    act(() => text().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(text().getAttribute("aria-invalid")).toBe("true");
    expect(changes).toEqual(["1990-10-29"]);
    type("#d", "");
    expect(changes).toEqual(["1990-10-29", ""]);
  });

  it("shows a date set from outside", () => {
    mount("1990-10-29");
    click("#reset");
    expect(text().value).toBe("Fri 2 Jan 1990");
  });

  it("keeps the time with the date for the custody log", () => {
    mount("1990-10-20T14:05", true);
    expect(text().value).toBe("Tue 20 Oct 1990");
    const time = must<HTMLInputElement>(".game-date-time");
    expect(time.value).toBe("14:05");
    type(".game-date-time", "09:00");
    expect(changes).toEqual(["1990-10-20T09:00"]);
    type("#d", "21 Oct 1990");
    expect(changes.at(-1)).toBe("1990-10-21T09:00");
  });
});
