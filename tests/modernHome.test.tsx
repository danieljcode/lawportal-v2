// @vitest-environment jsdom
// The modern home screen (LP-127): a tile for each program the character can
// see, and what needs attention (deadlines due within 48 hours or overdue,
// recent filings, recent cases), each one click away, with empty states. The
// Classic layout keeps the Program Manager.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { filingStore, type NewFiling } from "@/lib/filings";
import { EMPTY_STATE } from "@/lib/formState";
import { setShell } from "@/lib/shell";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function mount(): void {
  history.replaceState(null, "", location.pathname);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
}

const texts = (sel: string) => [...document.querySelectorAll(sel)].map((el) => el.textContent);

const filing = (over: Partial<NewFiling> = {}): NewFiling => ({
  formId: "civil-complaint",
  formTitle: "Civil Complaint",
  charId: "alice001",
  charName: "Alice Lawyer",
  caseNumber: "90SCCV00001",
  caseId: "case0001",
  via: "forum",
  state: { ...EMPTY_STATE, values: { "Plaintiff name": "Ann" } },
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(sync, "init").mockResolvedValue(undefined);
  characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
  characterStore().save({ id: "carl0001", name: "Carl Commissioner", title: "Court Commissioner" });
  characterStore().setActive("alice001");
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

describe("the modern home screen (LP-127)", () => {
  it("has a tile for each program the character can see, the J.A.P. only for a Court Commissioner", () => {
    mount();
    expect(texts(".home-tile-label")).toEqual([
      "Court Filings",
      "Case File",
      "Clients",
      "Law Library",
      "Ledger",
      "Settings",
    ]);
    expect(must("#tile-filings").getAttribute("href")).toBe("#filings");
    act(() => characterStore().setActive("carl0001"));
    expect(texts(".home-tile-label")).toContain("J.A.P.");
    expect(must("#tile-jap").getAttribute("href")).toBe("#jap");
  });

  it("says so when there's nothing to show", () => {
    mount();
    expect(must("#home-due-empty").textContent).toBe("Nothing due in the next 48 hours on Alice Lawyer's cases.");
    expect(must("#home-filings-empty").textContent).toContain("No filings yet.");
    expect(must("#home-cases-empty").textContent).toContain("No cases on Alice Lawyer's docket yet.");
    expect(must<HTMLAnchorElement>("#home-cases-empty a").getAttribute("href")).toBe("#clients/intake");
  });

  it("lists deadlines due within 48 hours or overdue on the character's cases, linking to each case", () => {
    caseStore().save({
      id: "case0001",
      caseNumber: "90SCCR00147",
      plaintiff: "People",
      defendant: "Lee",
      lead: "alice001",
      deadlines: [
        { id: "d1", date: "1990-10-17", label: "Response due" },
        { id: "d2", date: "1990-10-21", label: "Hearing" },
        { id: "d3", date: "1990-10-25", label: "Trial" },
        { id: "d4", date: "1990-10-18", label: "Dealt with", done: true },
      ],
    });
    caseStore().save({
      id: "case0002",
      caseNumber: "90SCCR00200",
      lead: "carl0001",
      deadlines: [{ id: "d5", date: "1990-10-19", label: "Someone else's" }],
    });
    mount();
    const items = [...document.querySelectorAll("#home-due li")];
    expect(items.map((li) => li.querySelector("strong")!.textContent)).toEqual(["Response due", "Hearing"]);
    expect(items[0].className).toBe("overdue");
    expect(items[0].textContent).toContain("Sat 17 Oct 1990, overdue, 2 days ago");
    expect(items[0].textContent).toContain("90SCCR00147 · People v. Lee");
    expect(items[0].querySelector("a")!.getAttribute("href")).toBe("#cases/case0001");
    expect(items[1].textContent).toContain("in 2 days");
    expect(must("#tile-cases").getAttribute("aria-label")).toBe("Case File (2 due soon)");
  });

  it("lists the character's latest filings and opens one again as a draft of its form", () => {
    filingStore().add(filing({ formId: "civil-complaint", formTitle: "Civil Complaint" }));
    filingStore().add(filing({ formId: "extra-general-motion", formTitle: "General Motion", state: EMPTY_STATE }));
    filingStore().add(filing({ formTitle: "Bob's filing", charId: "bob00001", charName: "Bob" }));
    mount();
    expect(texts("#home-filings strong")).toEqual(["General Motion", "Civil Complaint"]);
    act(() => must<HTMLButtonElement>("#home-filings li:nth-child(2) button").click());
    expect(location.hash).toBe("#filings/civil-complaint");
  });

  it("keeps only the five newest filings", () => {
    for (let i = 0; i < 7; i++) filingStore().add(filing({ state: { ...EMPTY_STATE, values: { n: String(i) } } }));
    mount();
    expect(document.querySelectorAll("#home-filings li")).toHaveLength(5);
  });

  it("lists the character's cases worked on most recently first, linking to each", () => {
    caseStore().save({ id: "case0001", caseNumber: "90SCCR00001", lead: "alice001" });
    vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
    caseStore().save({ id: "case0002", caseNumber: "90SCCR00002", lead: "carl0001", assigned: ["alice001"] });
    caseStore().save({ id: "case0003", caseNumber: "90SCCR00003", lead: "carl0001" });
    mount();
    expect(texts("#home-cases strong")).toEqual(["90SCCR00002", "90SCCR00001"]);
    expect(must("#home-cases a").getAttribute("href")).toBe("#cases/case0002");
  });

  it("shows the whole firm's with no character", () => {
    caseStore().save({ id: "case0003", caseNumber: "90SCCR00003", lead: "carl0001" });
    filingStore().add(filing({ charName: "Carl", charId: "carl0001" }));
    characterStore().setActive(null);
    mount();
    expect(texts("#home-cases strong")).toEqual(["90SCCR00003"]);
    expect(must("#home-filings").textContent).toContain("Carl");
    expect(must("#home-due-empty").textContent).toContain("the firm's cases");
  });

  it("keeps the Program Manager as the Classic layout's home", () => {
    setShell("classic");
    mount();
    expect(must("#program-manager")).toBeTruthy();
    expect(document.querySelector("#home")).toBeNull();
  });
});
