// @vitest-environment jsdom
// The deadline calculator (LP-220): "X days after" in game time, calendar or weekdays only, across
// month and year ends, and in the Case File: worked out and added to the case as a deadline.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { dueDate, formatDay } from "@/lib/deadlines";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("dueDate", () => {
  it("counts calendar days across month and year ends", () => {
    expect(dueDate("1990-10-19", 14)).toBe("1990-11-02");
    expect(dueDate("1990-12-28", 5)).toBe("1991-01-02");
    expect(dueDate("1990-01-31", 28)).toBe("1990-02-28");
    // 1992 is a game leap year, as its real year 2028 is.
    expect(dueDate("1992-02-28", 1)).toBe("1992-02-29");
    expect(dueDate("1990-10-19", 0)).toBe("1990-10-19");
  });

  it("skips Saturdays and Sundays when counting weekdays, by the real weekday", () => {
    expect(formatDay("1990-10-23")).toBe("Fri 23 Oct 1990");
    expect(dueDate("1990-10-23", 1, true)).toBe("1990-10-26"); // Mon
    expect(dueDate("1990-10-23", 5, true)).toBe("1990-10-30"); // Fri
    expect(dueDate("1990-10-24", 1, true)).toBe("1990-10-26"); // from a Saturday: Mon
    expect(formatDay("1990-12-31")).toBe("Thu 31 Dec 1990");
    expect(dueDate("1990-12-31", 2, true)).toBe("1991-01-04"); // Fri 1, Mon 4 Jan
    expect(dueDate("1990-10-23", 0, true)).toBe("1990-10-23");
  });

  it("gives nothing for a bad date or count", () => {
    expect(dueDate("1990-13-01", 1)).toBe("");
    expect(dueDate("1990-10-19", -1)).toBe("");
    expect(dueDate("1990-10-19", 1.5)).toBe("");
    expect(dueDate("1990-10-19", NaN)).toBe("");
    expect(dueDate("1990-10-19", 3651)).toBe("");
  });
});

/* ---------- in the Case File ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement | HTMLSelectElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

describe("Calculate on a case's deadlines", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", lead: "alice001" });
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

  it("works out the date from today and adds it as a deadline", () => {
    history.replaceState(null, "", "#cases/case0001");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    expect(document.querySelector("#deadline-calc")).toBeNull();
    act(() => must("#deadline-calc-toggle").click());
    expect(must("#calc-result").textContent).toBe("Enter a number of days.");
    expect(document.querySelector("#calc-add")).toBeNull();

    setValue("#calc-days", "14");
    expect(must("#calc-result").textContent).toBe("Due Mon 2 Nov 1990");
    setValue("#calc-kind", "weekdays");
    expect(must("#calc-result").textContent).toBe("Due Fri 6 Nov 1990");
    setValue("#calc-days", "-3");
    expect(must("#calc-result").textContent).toContain("whole number");

    setValue("#calc-days", "10");
    setValue("#calc-kind", "calendar");
    setValue("#calc-label", "");
    act(() => must("#calc-add").click());
    expect(must("#calc-error").textContent).toContain("Give it a name");
    setValue("#calc-label", "Discovery due");
    act(() => must("#calc-add").click());

    expect(caseStore().get("case0001")!.deadlines).toMatchObject([
      { date: "1990-10-29", label: "Discovery due", note: "10 days after Mon 19 Oct 1990" },
    ]);
    expect(document.querySelector("#deadline-calc")).toBeNull();
  });
});
