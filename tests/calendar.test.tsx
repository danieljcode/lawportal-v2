// @vitest-environment jsdom
// The month calendar (LP-231): a game month's open deadlines, hearings and dated next actions by day,
// My work or All firm, moved by Previous / Next / Today, and reached at #cases/calendar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { calendarKind, monthEntries } from "@/lib/calendar";
import { caseStore, cleanCase } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { hashFor, parseHash } from "@/shell/useRoute";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mine = {
  id: "case0001",
  caseNumber: "90SCCR00147",
  lead: "alice001",
  deadlines: [
    { id: "dl000001", date: "1990-10-22", label: "Disclosure due" },
    { id: "dl000002", date: "1990-10-22", label: "Preliminary hearing" },
    { id: "dl000003", date: "1990-10-23", label: "Old one", done: true },
    { id: "dl000004", date: "1990-11-02", label: "Next month" },
  ],
  actions: [
    { id: "act00001", title: "Call the client", due: "1990-10-22", owner: "alice001" },
    { id: "act00002", title: "Bob's job", due: "1990-10-24", owner: "bob00001" },
    { id: "act00003", title: "No date" },
  ],
};
const theirs = {
  id: "case0002",
  caseNumber: "90SCCC00200",
  lead: "bob00001",
  deadlines: [{ id: "dl000005", date: "1990-10-25", label: "Trial" }],
};

describe("monthEntries", () => {
  it("lists a month's open items by day, hearings first, and filters to My work", () => {
    const cases = [cleanCase(mine), cleanCase(theirs)];
    const firm = monthEntries(cases, null, "1990-10");
    expect([...firm.keys()]).toEqual(["1990-10-22", "1990-10-24", "1990-10-25"]);
    expect(firm.get("1990-10-22")!.map((e) => [e.kind, e.title])).toEqual([
      ["hearing", "Preliminary hearing"],
      ["deadline", "Disclosure due"],
      ["action", "Call the client"],
    ]);
    // Alice: her case's deadlines and her own actions; not Bob's action on her case, nor Bob's case.
    expect([...monthEntries(cases, "alice001", "1990-10").keys()]).toEqual(["1990-10-22"]);
    expect(calendarKind("Arraignment")).toBe("hearing");
    expect(calendarKind("File the answer")).toBe("deadline");
  });

  it("has its own address", () => {
    expect(parseHash("#cases/calendar")).toEqual({ program: "cases", caseId: null, calendar: true });
    expect(hashFor({ program: "cases", caseId: null, calendar: true })).toBe("#cases/calendar");
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}
const cell = (date: string) => must(`#cal-grid td[data-date="${date}"]`);

describe("the Calendar page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().save({ id: "bob00001", name: "Bob Lawyer" });
    characterStore().setActive("alice001");
    caseStore().save(mine);
    caseStore().save(theirs);
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the month, switches whose work and moves between months", () => {
    history.replaceState(null, "", "#cases/calendar");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    expect(must("#cal-month").textContent).toBe("October 1990");
    expect(must("#case-nav-calendar").getAttribute("aria-current")).toBe("page");
    expect(cell("1990-10-19").className).toBe("cal-today");
    // Real weekdays (2026): 1 Oct 1990 is a Thursday, so the first row starts with three blanks.
    expect(document.querySelectorAll("#cal-grid tbody tr:first-child td.cal-pad")).toHaveLength(3);
    const day = cell("1990-10-22");
    expect([...day.querySelectorAll(".cal-entry")].map((li) => li.className)).toEqual([
      "cal-entry cal-hearing",
      "cal-entry cal-deadline",
      "cal-entry cal-action",
    ]);
    expect(day.querySelector("a")!.getAttribute("href")).toBe("#cases/case0001");
    expect(cell("1990-10-25").textContent).not.toContain("Trial");

    act(() => must("#cal-scope-firm").click());
    expect(cell("1990-10-25").textContent).toContain("Trial");
    expect(cell("1990-10-24").textContent).toContain("Bob's job");
    expect(must("#cal-list").textContent).toContain("Thu 22 Oct 1990");

    act(() => must("#cal-next").click());
    expect(must("#cal-month").textContent).toBe("November 1990");
    expect(cell("1990-11-02").textContent).toContain("Next month");
    act(() => must("#cal-prev").click());
    act(() => must("#cal-prev").click());
    expect(must("#cal-month").textContent).toBe("September 1990");
    expect(must("#cal-list").textContent).toContain("Nothing due in September 1990.");
    act(() => must("#cal-today").click());
    expect(must("#cal-month").textContent).toBe("October 1990");
  });
});
