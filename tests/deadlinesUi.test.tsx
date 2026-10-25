// @vitest-environment jsdom
// Deadlines through the whole App (LP-18): adding, ticking off and removing
// them on a case (without losing unsaved edits to its details), the Upcoming
// page, the toolbar dot, and adding a case schedule's dates from the form.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { EMPTY_STATE, writeDraft } from "@/lib/formState";
import { defaultKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function mount(hash: string): void {
  // An empty string would keep the current URL: the start page needs the bare path.
  history.replaceState(null, "", hash || location.pathname);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

function setValue(sel: string, value: string): void {
  const el = must<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function submit(sel: string): void {
  act(() => {
    must(sel).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 19, 12, 0)); // in-game Fri 19 Oct 1990
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Judge", title: "Judge" });
  characterStore().setActive("alice001");
  caseStore().save({ id: "case0001", caseNumber: "90SCCR00147", plaintiff: "Ann", defendant: "Bo", lead: "alice001" });
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

describe("deadlines on a case (LP-18)", () => {
  it("adds a deadline, ticks it off and removes it, keeping unsaved edits to the case", () => {
    mount("#cases/case0001");
    setValue("#case-notes", "Not saved yet");
    setValue("#deadline-date", "1990-10-25");
    setValue("#deadline-label", "Response due");
    setValue("#deadline-note", "From the summons");
    submit("#deadline-add");
    expect(caseStore().get("case0001")!.deadlines).toMatchObject([
      { date: "1990-10-25", label: "Response due", note: "From the summons" },
    ]);
    expect(must("#deadline-list").textContent).toContain("Thu 25 Oct 1990 (in 6 days)");
    expect(must<HTMLTextAreaElement>("#case-notes").value).toBe("Not saved yet");

    act(() => must<HTMLInputElement>("#deadline-list input[type=checkbox]").click());
    expect(caseStore().get("case0001")!.deadlines[0].done).toBe(true);
    act(() => must("#deadline-list .mini").click());
    expect(caseStore().get("case0001")!.deadlines).toEqual([]);
  });

  it("needs a name for the deadline", () => {
    mount("#cases/case0001");
    submit("#deadline-add");
    expect(must("#deadline-error").textContent).toContain("Give it a name");
  });
});

describe("Upcoming and the toolbar dot (LP-18)", () => {
  const withDeadlines = (deadlines: Array<{ date: string; label: string }>) =>
    caseStore().save({ ...caseStore().get("case0001")!, deadlines });

  it("lists the next 14 days on the character's cases, overdue first, and Done clears one", () => {
    withDeadlines([
      { date: "1990-10-17", label: "Response due" },
      { date: "1990-10-30", label: "Openings" },
      { date: "1990-11-20", label: "Too far" },
    ]);
    mount("#upcoming");
    expect(must("#upcoming-title").textContent).toBe("Upcoming");
    expect(must("#upcoming-scope").textContent).toContain("Today is Fri 19 Oct 1990");
    expect(must("#upcoming-scope").textContent).toContain("Alice Judge's cases");
    const items = [...document.querySelectorAll(".upcoming-item")];
    expect(items.map((li) => li.querySelector(".upcoming-what strong")!.textContent)).toEqual([
      "Response due",
      "Openings",
    ]);
    expect(items[0].className).toContain("overdue");
    expect(items[0].textContent).toContain("Overdue, 2 days ago");
    expect(items[0].querySelector("a")!.getAttribute("href")).toBe("#cases/case0001");
    act(() => (items[0].querySelector("button") as HTMLButtonElement).click());
    expect(document.querySelectorAll(".upcoming-item")).toHaveLength(1);
  });

  it("marks Case File on the home screen when something is due within 48 hours, and lists it", () => {
    mount("");
    expect(document.querySelector("#tile-cases .pm-badge")).toBeNull();
    act(() => {
      withDeadlines([{ date: "1990-10-20", label: "Hearing" }]);
    });
    expect(must("#tile-cases .pm-badge")).toBeTruthy();
    expect(must("#tile-cases").getAttribute("aria-label")).toBe("Case File (1 due soon)");
    expect(must("#home-due").textContent).toContain("Hearing");
    // The app rail's Case File carries no dot.
    expect(must("#rail-cases").getAttribute("href")).toBe("#cases");
    // The Case File program's File menu leads there too (LP-103).
    act(() => {
      history.pushState(null, "", "#cases");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    act(() => must("#menu-file").click());
    expect(must('.menu-list a[href="#cases/upcoming"]').textContent).toBe("Upcoming");
  });

  it("says when nothing is coming up", () => {
    mount("#upcoming");
    expect(must("#upcoming-empty").textContent).toContain("Nothing due in the next 14 days");
  });
});

describe("dates from a form (LP-18)", () => {
  it("adds a case schedule's dates to its case, the suggested ones ticked", () => {
    writeDraft(defaultKV(), "criminal-case-schedule", {
      ...EMPTY_STATE,
      values: { "Case number": "90SCCR00147", "Filing date": "1990-10-19", Judgement: "1990-11-09" },
    });
    mount("#criminal-case-schedule");
    act(() => must("#dates-open").click());
    const boxes = [...document.querySelectorAll<HTMLInputElement>("#dates-panel input[type=checkbox]")];
    const labels = [...document.querySelectorAll("#dates-panel li span")].map((s) => s.textContent);
    expect(labels).toContain("Judgement · Fri 9 Nov 1990");
    // The filing date isn't suggested; the computed schedule dates are.
    const filed = labels.findIndex((l) => l!.startsWith("Filing date"));
    expect(boxes[filed].checked).toBe(false);
    expect(boxes.filter((b) => b.checked).length).toBeGreaterThan(1);
    act(() => must("#dates-add").click());
    const added = caseStore().get("case0001")!.deadlines;
    expect(added.find((d) => d.label === "Judgement")).toMatchObject({ date: "1990-11-09" });
    expect(added.some((d) => d.label === "Filing date")).toBe(false);
    expect(must("#docket-status").textContent).toMatch(/^Added \d+ dates to 90SCCR00147's deadlines\.$/);
    // Again: nothing new.
    act(() => must("#dates-open").click());
    act(() => must("#dates-add").click());
    expect(must("#docket-status").textContent).toBe("Those dates are already on 90SCCR00147.");
  });

  it("isn't offered when the form's case number isn't a firm case", () => {
    writeDraft(defaultKV(), "criminal-case-schedule", {
      ...EMPTY_STATE,
      values: { "Case number": "90SCCR09999", Judgement: "1990-11-09" },
    });
    mount("#criminal-case-schedule");
    expect(document.querySelector("#dates-open")).toBeNull();
  });
});
