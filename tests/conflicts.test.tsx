// @vitest-environment jsdom
// Conflict check (LP-10): forgiving name matching, searching both sides of every
// case and the notes, the verdict and memo, the log (and its sync), and the
// program and the intake's "Run conflict check" through the whole App.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/components/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import {
  checkConflicts,
  cleanCheck,
  conflictLog,
  conflictMemo,
  createConflictLog,
  nameMatch,
  nameWords,
  partyNames,
} from "@/lib/conflicts";
import { memoryKV } from "@/lib/storage";
import * as sync from "@/lib/sync";
import type { Case } from "@/lib/types";

const T = "2026-10-01T00:00:00.000Z";
const mk = (id: string, over: Partial<Case>): Case => ({
  id,
  caseNumber: "90SCCR" + id.slice(-5),
  status: "Open",
  updated: T,
  created: T,
  lead: "alice001",
  assigned: [],
  deadlines: [],

  exhibits: [],
  ...over,
});

describe("matching names", () => {
  it("ignores capitals, punctuation and business suffixes", () => {
    expect(nameWords("Los Santos Customs, LLC.")).toEqual(["los", "santos", "customs"]);
    expect(nameMatch("ann LEE", "Ann Lee")).toBe("exact");
    expect(nameMatch("Los Santos Customs", "los santos customs inc")).toBe("exact");
  });

  it("finds part of a name and initials, marked partial", () => {
    expect(nameMatch("Lee", "Ann Lee")).toBe("exact");
    expect(nameMatch("A. Lee", "Ann Lee")).toBe("partial");
    expect(nameMatch("Ann Le", "Ann Lee")).toBeNull(); // two letters are too few to count as part of a name
    expect(nameMatch("Annabel", "Ann Lee")).toBeNull();
    expect(nameMatch("Bob", "Ann Lee")).toBeNull();
  });

  it("won't match on initials alone or very short fragments", () => {
    expect(nameMatch("A. L.", "Ann Lee")).toBeNull();
    expect(nameMatch("An", "Ann Lee")).toBeNull();
  });

  it("splits a party field into names", () => {
    expect(partyNames("Ann Lee, Bo Day and Cy Ng")).toEqual(["Ann Lee", "Bo Day", "Cy Ng"]);
    expect(partyNames(undefined)).toEqual([]);
  });
});

describe("checking the firm's cases", () => {
  const cases = [
    mk("case0001", { plaintiff: "People of San Andreas", defendant: "Ann Lee", status: "Closed" }),
    mk("case0002", { plaintiff: "Bo Day, Ann Lee", defendant: "Los Santos Customs LLC", lead: "bob00001" }),
    mk("case0003", { plaintiff: "Cy Ng", notes: "Witness: Ann Lee saw the crash." }),
    mk("case0004", { plaintiff: "Dee Long", defendant: "Eve Park" }),
  ];

  it("finds a name on either side of every case, and in the notes", () => {
    const m = checkConflicts(["ann lee"], cases);
    expect(m.map((x) => [x.caseNumber, x.side, x.status, x.lead])).toEqual([
      ["90SCCRe0001", "defendant", "Closed", "alice001"],
      ["90SCCRe0002", "plaintiff", "Open", "bob00001"],
      ["90SCCRe0003", "notes", "Open", "alice001"],
    ]);
  });

  it("checks several names, businesses too", () => {
    const m = checkConflicts(["Los Santos Customs", "Nobody Here"], cases);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ side: "defendant", matched: "Los Santos Customs LLC", strength: "exact" });
  });

  it("finds nothing for a new name", () => {
    expect(checkConflicts(["Zed Quinn"], cases)).toEqual([]);
  });

  it("writes a short memo with the verdict and matches", () => {
    const m = checkConflicts(["A. Lee"], cases);
    const memo = conflictMemo(["A. Lee"], m, "1990-10-19", "Alice", (id) => (id === "bob00001" ? "Bob" : "Alice"));
    expect(memo).toContain("Conflict check\nDate: Fri 19 Oct 1990\nRun by: Alice\nNames checked: A. Lee");
    expect(memo).toContain("Result: Possible conflict: review before accepting");
    expect(memo).toContain(
      '90SCCRe0002 · Plaintiff / petitioner · Open · Lead: Bob · "A. Lee" matched "Ann Lee" (partial)',
    );
    expect(conflictMemo(["Zed"], [], "1990-10-19", undefined, () => "")).toContain("Result: No conflicts found");
  });
});

describe("the log", () => {
  it("keeps who, when, the names and the result, newest first", () => {
    const log = createConflictLog(memoryKV());
    log.add({
      charId: "alice001",
      charName: "Alice",
      names: ["Ann Lee"],
      matches: 2,
      caseNumbers: ["90SCCR00001"],
      at: T,
    });
    log.add({ charId: null, names: ["Zed"], matches: 0, caseNumbers: [], at: "2026-10-02T00:00:00.000Z" });
    expect(log.list().map((c) => [c.names[0], c.matches])).toEqual([
      ["Zed", 0],
      ["Ann Lee", 2],
    ]);
    expect(cleanCheck({ at: T, names: [] })).toBeNull();
  });

  it("syncs, and an older copy without it keeps this browser's", () => {
    localStorage.clear();
    sync.__resetForTests();
    conflictLog().add({ charId: null, names: ["Ann Lee"], matches: 0, caseNumbers: [] });
    expect(sync.snapshot().conflictChecks).toHaveLength(1);
    const theirs = cleanCheck({ id: "chk00009", at: T, names: ["Bo Day"], matches: 1, caseNumbers: ["90SCCR00002"] })!;
    expect(sync.resolve({ characters: [], conflictChecks: [theirs] }, null).doc.conflictChecks).toHaveLength(2);
    expect(sync.resolve({ characters: [] }, null).doc.conflictChecks).toHaveLength(1);
    localStorage.clear();
  });
});

/* ---------- through the App ---------- */

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

function mount(hash: string): void {
  history.replaceState(null, "", hash);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

describe("the Conflict check program and the intake (LP-10)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0));
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
    characterStore().setActive("alice001");
    caseStore().save({
      id: "case0001",
      caseNumber: "90SCCR00147",
      plaintiff: "People",
      defendant: "Ann Lee",
      lead: "alice001",
    });
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

  it("checks names, shows the verdict and matches, and logs the check", () => {
    mount("#conflicts");
    expect(must('#sidebar a[href="#conflicts"]').textContent).toBe("Conflict check");
    setValue("#conflict-names", "A. Lee\nZed Quinn");
    act(() => must("#conflict-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(must("#conflict-verdict").textContent).toBe("Possible conflict: review before accepting");
    expect(must("#conflict-matches").textContent).toContain("90SCCR00147");
    expect(must("#conflict-matches").textContent).toContain("Defendant / respondent");
    expect(must("#conflict-matches").textContent).toContain("Lead: Alice Lawyer");
    expect(must("#conflict-memo").textContent).toContain("Run by: Alice Lawyer");
    expect(conflictLog().list()[0]).toMatchObject({
      charName: "Alice Lawyer",
      names: ["A. Lee", "Zed Quinn"],
      matches: 1,
    });
    expect(must("#conflict-log").textContent).toContain("A. Lee; Zed Quinn");
  });

  it("says when nothing conflicts, and copies or prints the memo", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    mount("#conflicts");
    setValue("#conflict-names", "Zed Quinn");
    act(() => must("#conflict-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(must("#conflict-verdict").textContent).toBe("No conflicts found");
    await act(async () => {
      must("#conflict-copy").click();
      await Promise.resolve();
    });
    expect(writeText.mock.calls[0][0]).toContain("Result: No conflicts found");
    act(() => must("#conflict-print").click());
    expect(print).toHaveBeenCalledTimes(1);
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it("needs a name", () => {
    mount("#conflicts");
    act(() => must("#conflict-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(must("#conflict-error").textContent).toContain("at least one name");
    expect(conflictLog().list()).toEqual([]);
  });

  it("the intake's Run conflict check checks the client and the opposing party", () => {
    mount("#intake");
    expect(must<HTMLButtonElement>("#intake-conflicts").disabled).toBe(true);
    setValue("#intake-clientName", "Cy Ng");
    setValue("#intake-opposingParty", "Ann Lee");
    act(() => must("#intake-conflicts").click());
    expect(must("#conflict-verdict").textContent).toBe("Possible conflict: review before accepting");
    expect(conflictLog().list()[0].names).toEqual(["Cy Ng", "Ann Lee"]);
  });
});
