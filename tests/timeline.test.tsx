// @vitest-environment jsdom
// The case timeline (LP-219): every kind of entry in date order, newest first, undated last; actions
// keep the day they were ticked off; and in the Case File: grouped by day, filtered by type, each
// entry going to where it lives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { cleanAction, setDone } from "@/lib/actions";
import { caseStore, cleanCase } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import type { Filing } from "@/lib/filings";
import type { Invoice } from "@/lib/invoices";
import type { TimeEntry } from "@/lib/ledger";
import { byDay, caseTimeline } from "@/lib/timeline";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const c = cleanCase({
  id: "case0001",
  caseNumber: "90SCCR00147",
  lead: "alice001",
  created: "2026-10-01T15:00:00.000Z",
  caseNotes: [{ id: "note0001", text: "Client called.", at: "2026-10-05T16:30:00.000Z", by: "alice001" }],
  deadlines: [{ id: "dead0001", date: "1990-10-20", label: "Arraignment", done: true }],
  actions: [
    { id: "act00001", title: "Request disclosure", done: true, doneOn: "1990-10-06", owner: "alice001" },
    { id: "act00002", title: "Old one", done: true },
    { id: "act00003", title: "Still open" },
  ],
  exhibits: [
    {
      id: "exh00001",
      title: "Dashcam",
      obtained: "1990-10-03",
      custody: [{ id: "cus00001", at: "1990-10-04T09:15", action: "received", by: "Alice Lawyer" }],
    },
  ],
});
const filing = {
  id: "fil00001",
  at: "2026-10-07T14:00:00.000Z",
  formTitle: "Motion",
  via: "pdf",
  charName: "Alice Lawyer",
};
const time = {
  id: "tim00001",
  caseId: "case0001",
  character: "alice001",
  date: "1990-10-05",
  hours: 1.5,
  activity: "drafting",
};
const other = { ...time, id: "tim00002", caseId: "case0002" };
const invoice = {
  id: "inv00001",
  number: "FA-1990-0001",
  caseId: "case0001",
  date: "1990-10-08",
  lines: [{ amount: 150 }],
  payments: [{ id: "pay00001", date: "1990-10-09", amount: 100, method: "bank" }],
};
const sources = {
  filings: [filing] as unknown as Filing[],
  time: [time, other] as unknown as TimeEntry[],
  invoices: [invoice] as unknown as Invoice[],
  nameOf: (id: string | null | undefined) => (id === "alice001" ? "Alice Lawyer" : ""),
};

describe("caseTimeline", () => {
  it("lists everything on the case, newest first, with undated entries last", () => {
    const events = caseTimeline(c, sources);
    expect(events.map((e) => [e.date, e.time || "", e.title])).toEqual([
      ["1990-10-20", "", "Arraignment (dealt with)"],
      ["1990-10-09", "", "$100.00 paid on FA-1990-0001, bank transfer"],
      ["1990-10-08", "", "Invoice FA-1990-0001 issued, $150.00"],
      ["1990-10-07", "10:00", "Motion"],
      ["1990-10-06", "", "Done: Request disclosure"],
      ["1990-10-05", "12:30", "Note by Alice Lawyer"],
      ["1990-10-05", "", "1.5 hours, drafting by Alice Lawyer"],
      ["1990-10-04", "09:15", "Exhibit A, Dashcam: received by Alice Lawyer"],
      ["1990-10-03", "", "Exhibit A, Dashcam: obtained"],
      ["", "", "Done: Old one"],
    ]);
    expect(events.find((e) => e.kind === "time")!.target).toBe("#ledger/case/case0001");
    expect(events.find((e) => e.kind === "note")!.target).toBe("case-notes");
  });

  it("groups by day", () => {
    const days = byDay(caseTimeline(c, sources));
    expect(days.map(([d, l]) => [d, l.length])).toContainEqual(["1990-10-05", 2]);
    expect(days[days.length - 1][0]).toBe("");
  });
});

describe("ticking an action off", () => {
  it("keeps the game day it was done, and drops it when reopened", () => {
    const a = setDone({ id: "act00001", title: "Call" }, true, "1990-10-19");
    expect(a).toEqual({ id: "act00001", title: "Call", done: true, doneOn: "1990-10-19" });
    expect(cleanAction(a)).toEqual(a);
    expect(setDone(a, false, "1990-10-20")).toEqual({ id: "act00001", title: "Call" });
    expect(cleanAction({ ...a, done: false })).not.toHaveProperty("doneOn");
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

describe("the Timeline section", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z"));
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().setActive("alice001");
    caseStore().save(c);
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

  it("shows the case by day, filters by type, and goes to where an entry lives", () => {
    history.replaceState(null, "", "#cases/case0001");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    const days = () => [...document.querySelectorAll("#timeline-list h5")].map((h) => h.textContent);
    expect(days()).toEqual([
      "Tue 20 Oct 1990",
      "Tue 6 Oct 1990",
      "Mon 5 Oct 1990",
      "Sun 4 Oct 1990",
      "Sat 3 Oct 1990",
      "No date",
    ]);

    const filter = must<HTMLSelectElement>("#timeline-filter");
    act(() => {
      filter.value = "evidence";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(days()).toEqual(["Sun 4 Oct 1990", "Sat 3 Oct 1990"]);
    act(() => {
      filter.value = "time";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(must("#timeline-none-shown")).toBeTruthy();

    act(() => {
      filter.value = "note";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => must<HTMLButtonElement>("#timeline-list button").click());
    expect(document.activeElement).toBe(must("#case-notes"));
  });

  it("says so when there's nothing on the case", () => {
    caseStore().save({ id: "case0002", caseNumber: "90SCCR00148", lead: "alice001" });
    history.replaceState(null, "", "#cases/case0002");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));
    expect(must("#timeline-none")).toBeTruthy();
  });
});
