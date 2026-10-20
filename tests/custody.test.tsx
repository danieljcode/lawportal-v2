// @vitest-environment jsdom
// Chain of custody (LP-14): in-game times, cleaning, append-only order, merging
// two copies, the copied list (escaped), sync and backup, and the log on the
// case page: add, correct with a new entry, copy for a filing and print.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { makeBackup } from "@/lib/backup";
import { caseStore, createCaseStore, unifyCases } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import * as clipboard from "@/lib/clipboard";
import {
  appendCustody,
  cleanCustody,
  cleanCustodyEntry,
  custodyHtml,
  custodyText,
  formatAt,
  gameNow,
  isCustodyTime,
  unionCustody,
  type CustodyEntry,
} from "@/lib/custody";
import { cleanExhibit } from "@/lib/exhibits";
import { memoryKV } from "@/lib/storage";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string, at: string, action: CustodyEntry["action"] = "received", note?: string): CustodyEntry => ({
  id,
  at,
  action,
  by: "Alice Lawyer",
  ...(note ? { note } : {}),
});

describe("custody times", () => {
  it("are in-game (1990) local time, to the minute", () => {
    expect(gameNow(new Date(2026, 9, 20, 14, 5, 59))).toBe("1990-10-20T14:05");
    expect(formatAt("1990-10-20T14:05")).toBe("Sat 20 Oct 1990, 14:05");
  });

  it("must be a real date and time", () => {
    expect(isCustodyTime("1990-10-20T14:05")).toBe(true);
    for (const bad of ["1990-10-20", "1990-02-30T10:00", "1990-10-20T24:00", "1990-10-20T10:60", "x", 5]) {
      expect(isCustodyTime(bad), String(bad)).toBe(false);
    }
  });
});

describe("custody logs", () => {
  it("need a time, a known action and who; keep a note", () => {
    expect(cleanCustodyEntry({ at: "1990-10-20T14:05", action: "lost", by: "A" })).toBeNull();
    expect(cleanCustodyEntry({ at: "1990-10-20T14:05", action: "filed", by: " " })).toBeNull();
    expect(
      cleanCustodyEntry({ id: "cus00001", at: "1990-10-20T14:05", action: "filed", by: " Alice ", note: " Bag 14 " }),
    ).toEqual({ id: "cus00001", at: "1990-10-20T14:05", action: "filed", by: "Alice", note: "Bag 14" });
  });

  it("stay in time order; adding never changes what's there", () => {
    const log = cleanCustody([entry("cus00002", "1990-10-21T09:00"), entry("cus00001", "1990-10-20T14:05")]);
    expect(log.map((e) => e.id)).toEqual(["cus00001", "cus00002"]);
    const late = entry("cus00003", "1990-10-20T18:00", "reviewed");
    const next = appendCustody(log, late);
    expect(next.map((e) => e.id)).toEqual(["cus00001", "cus00003", "cus00002"]);
    expect(next[0]).toBe(log[0]);
    expect(log).toHaveLength(2);
  });

  it("merge two copies of an exhibit, keeping every entry", () => {
    const a = [entry("cus00001", "1990-10-20T14:05")];
    const b = [entry("cus00001", "1990-10-20T14:05"), entry("cus00002", "1990-10-20T15:00", "copied")];
    expect(unionCustody(a, b).map((e) => e.id)).toEqual(["cus00001", "cus00002"]);
    const base = {
      caseNumber: "90SCCR00001",
      status: "Open" as const,
      created: "2026-10-01T00:00:00.000Z",
      lead: null,
      assigned: [],
      deadlines: [],
    };
    const [one] = unifyCases(
      [
        {
          ...base,
          id: "case0001",
          updated: "2026-10-02T00:00:00.000Z",
          exhibits: [{ id: "exh00001", title: "Dashcam", custody: a }],
        },
      ],
      [
        {
          ...base,
          id: "case0001",
          updated: "2026-10-01T00:00:00.000Z",
          exhibits: [{ id: "exh00001", title: "Old title", custody: b }],
        },
      ],
    );
    expect(one.exhibits[0].title).toBe("Dashcam");
    expect(one.exhibits[0].custody!.map((e) => e.id)).toEqual(["cus00001", "cus00002"]);
  });

  it("is left off an exhibit without entries", () => {
    expect(cleanExhibit({ id: "exh00001", title: "A", custody: [] })).toEqual({ id: "exh00001", title: "A" });
    expect(cleanExhibit({ id: "exh00001", title: "A", custody: [{ bad: 1 }] })).toEqual({
      id: "exh00001",
      title: "A",
    });
  });

  it("copy as a numbered list, every value escaped", () => {
    const log = [
      entry("cus00001", "1990-10-20T14:05", "received", "Sealed in bag 14"),
      {
        ...entry("cus00002", "1990-10-21T09:30", "reviewed", 'Line one\n<img src=x onerror="alert(1)">'),
        by: "<b>Bo</b>",
      },
    ];
    expect(custodyText("C", "Dashcam", log)).toBe(
      "Chain of custody: Exhibit C (Dashcam)\n" +
        "1. Sat 20 Oct 1990, 14:05: Received by Alice Lawyer. Sealed in bag 14\n" +
        '2. Sun 21 Oct 1990, 09:30: Reviewed by <b>Bo</b>. Line one\n<img src=x onerror="alert(1)">',
    );
    const html = custodyHtml("C", "<i>Dashcam</i>", log);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("img, b, i")).toBeNull();
    expect(doc.querySelectorAll("ol li")).toHaveLength(2);
    expect(doc.querySelector("strong")!.textContent).toBe("Chain of custody: Exhibit C (<i>Dashcam</i>)");
    expect(doc.querySelectorAll("ol li")[1].textContent).toBe(
      'Sun 21 Oct 1990, 09:30: Reviewed by <b>Bo</b>. Line one <img src=x onerror="alert(1)">',
    );
  });

  it("sync and back up with the case", () => {
    const kv = memoryKV();
    const custody = [entry("cus00001", "1990-10-20T14:05")];
    createCaseStore(kv).save({ caseNumber: "90SCCR00001", exhibits: [{ id: "exh00001", title: "Dashcam", custody }] });
    expect(JSON.stringify(makeBackup(kv).data)).toContain("cus00001");
    localStorage.clear();
    sync.__resetForTests();
    caseStore().save({ caseNumber: "90SCCR00002", exhibits: [{ id: "exh00002", title: "Bodycam", custody }] });
    expect(sync.snapshot().cases[0].exhibits[0].custody).toEqual(custody);
    localStorage.clear();
  });
});

/* ---------- on the case page ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
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
  act(() => must(sel).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

const click = (el: Element) => act(() => (el as HTMLElement).click());
const custodyButton = () =>
  [...document.querySelectorAll(".exhibit button")].find((b) => b.textContent!.startsWith("Custody"))!;
const lines = () => [...document.querySelectorAll(".custody-list li")].map((li) => li.textContent);
const saved = () => caseStore().get("case0001")!.exhibits[0].custody || [];

describe("the custody log on a case (LP-14)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 14, 5)); // in-game Sat 20 Oct 1990, 14:05
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer" });
    characterStore().save({ id: "bob00001", name: "Bob Clerk" });
    characterStore().setActive("alice001");
    caseStore().save({
      id: "case0001",
      caseNumber: "90SCCR00147",
      lead: "alice001",
      exhibits: [{ id: "exh00001", title: "Dashcam footage" }],
    });
    history.replaceState(null, "", "#cases/case0001");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));
    click(custodyButton());
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

  it("adds entries at the in-game time by the active character, and can't change them", () => {
    expect(must(".custody-empty").textContent).toContain("No one has logged");
    expect(must<HTMLInputElement>(".custody-at-input").value).toBe("1990-10-20T14:05");
    expect(must<HTMLSelectElement>(".custody-who-input").value).toBe("alice001");
    setValue(".custody-note-input", "Sealed in bag 14");
    submit(".custody-form");
    expect(lines()).toEqual(["Sat 20 Oct 1990, 14:05Receivedby Alice LawyerSealed in bag 14"]);
    expect(saved()).toMatchObject([
      { at: "1990-10-20T14:05", action: "received", by: "Alice Lawyer", byId: "alice001", note: "Sealed in bag 14" },
    ]);
    expect(must<HTMLInputElement>(".custody-note-input").value).toBe("");
    expect(custodyButton().textContent).toBe("Custody (1)");
    // Nothing in the log can be edited or deleted.
    expect(document.querySelector(".custody-list button, .custody-list input")).toBeNull();

    // A correction is a new entry, by someone else, earlier in the day: it goes in time order.
    setValue(".custody-at-input", "1990-10-20T09:00");
    setValue(".custody-action-input", "copied");
    setValue(".custody-who-input", "bob00001");
    setValue(".custody-note-input", "Correction: copied before it was bagged");
    submit(".custody-form");
    expect(saved().map((e) => e.by + " " + e.action)).toEqual(["Bob Clerk copied", "Alice Lawyer received"]);
  });

  it("takes someone else's name, and checks the time and name", () => {
    setValue(".custody-who-input", "");
    submit(".custody-form");
    expect(document.querySelector('.custody [role="status"]')!.textContent).toBe("Say who handled the exhibit.");
    setValue(".custody-name-input", "Officer Day");
    setValue(".custody-at-input", "");
    submit(".custody-form");
    expect(document.querySelector('.custody [role="status"]')!.textContent).toContain("date and time");
    setValue(".custody-at-input", "1990-10-19T22:15");
    submit(".custody-form");
    expect(saved()).toMatchObject([{ by: "Officer Day", at: "1990-10-19T22:15" }]);
    expect(saved()[0].byId).toBeUndefined();
  });

  it("keeps the log when the exhibit's details are edited", () => {
    submit(".custody-form");
    click([...document.querySelectorAll(".exhibit button")].find((b) => b.textContent === "Edit")!);
    setValue("#exhibit-title", "Dashcam footage, unit 4");
    submit("#exhibit-form");
    expect(caseStore().get("case0001")!.exhibits[0]).toMatchObject({ title: "Dashcam footage, unit 4" });
    expect(saved()).toHaveLength(1);
  });

  it("copies the log for a filing, and prints just the log", async () => {
    const copy = vi.spyOn(clipboard, "copyRich").mockResolvedValue(true);
    submit(".custody-form");
    await act(async () => must(".custody-copy").click());
    expect(copy.mock.calls[0][0]).toContain("<li>Sat 20 Oct 1990, 14:05: Received by Alice Lawyer.</li>");
    expect(copy.mock.calls[0][1]).toContain("Chain of custody: Exhibit A (Dashcam footage)");
    expect(document.querySelector('.custody [role="status"]')!.textContent).toContain("Copied the chain of custody");

    let sheet = "";
    vi.stubGlobal("print", () => {
      sheet = document.querySelector("#custody-sheet")?.textContent || "";
    });
    click(must(".custody-print"));
    expect(sheet).toContain("Chain of custody: Exhibit A (Dashcam footage)");
    expect(sheet).toContain("Received by Alice Lawyer.");
    expect(document.querySelector("#custody-sheet")).toBeNull();
  });
});
