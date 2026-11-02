// @vitest-environment jsdom
// The modern home screen (LP-127): a tile for each program the character can
// see, and what needs attention (the work list of deadlines, next actions and
// unpaid invoices, LP-171; recent filings; recent cases), each one click away,
// with empty states. The Classic layout keeps the Program Manager.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { filingStore, type NewFiling } from "@/lib/filings";
import { invoiceStore } from "@/lib/invoices";
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
      "Find",
      "Help",
      "Settings",
    ]);
    expect(must("#tile-filings").getAttribute("href")).toBe("#filings");
    act(() => characterStore().setActive("carl0001"));
    expect(texts(".home-tile-label")).toContain("J.A.P.");
    expect(must("#tile-jap").getAttribute("href")).toBe("#jap");
  });

  it("says so when there's nothing to show", () => {
    mount();
    expect(must("#home-work-empty").textContent).toContain("Nothing needs attention in Alice Lawyer's work");
    expect(must("#home-filings-empty").textContent).toContain("No filings yet.");
    expect(must("#home-cases-empty").textContent).toContain("No cases on Alice Lawyer's docket yet.");
    expect(must<HTMLAnchorElement>("#home-cases-empty a").getAttribute("href")).toBe("#clients/intake");
  });

  it("lists the next two weeks' deadlines and overdue ones on the character's cases, linking to each case", () => {
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
    const items = [...document.querySelectorAll("#home-work li")];
    expect(items.map((li) => li.querySelector("strong")!.textContent)).toEqual(["Response due", "Hearing", "Trial"]);
    expect(items[0].className).toBe("overdue");
    expect(items[0].textContent).toContain("Court");
    expect(items[0].textContent).toContain("Sat 17 Oct 1990, overdue, 2 days ago");
    expect(items[0].textContent).toContain("90SCCR00147 · People v. Lee");
    expect(items[0].querySelector("a")!.getAttribute("href")).toBe("#cases/case0001");
    expect(items[1].textContent).toContain("in 2 days");
    expect(items[1].className).toBe("soon");
    expect(items[2].className).toBe("");
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
    expect(must("#home-work-empty").textContent).toContain("for the firm");
    expect(document.querySelector("#home-scope-mine")).toBeNull();
    expect(must("#home-work-title").textContent).toBe("All firm work");
  });

  it("keeps the Program Manager as the Classic layout's home", () => {
    setShell("classic");
    mount();
    expect(must("#program-manager")).toBeTruthy();
    expect(document.querySelector("#home")).toBeNull();
  });
});

describe("the work list on the home screen (LP-171)", () => {
  const owed = {
    id: "inv00001",
    number: "FA-1990-0001",
    caseId: "case0001",
    caseNumber: "90SCCR00147",
    date: "1990-09-01",
    lines: [{ entryId: "ent00001", date: "1990-09-01", who: "Alice", activity: "court", hours: 2, rate: 150 }],
    payments: [],
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
  };

  beforeEach(() => {
    caseStore().save({
      id: "case0001",
      caseNumber: "90SCCR00147",
      plaintiff: "People",
      defendant: "Lee",
      lead: "alice001",
      deadlines: [{ id: "dl000001", date: "1990-10-21", label: "Hearing" }],
      actions: [
        { id: "ac000001", title: "Call the client", owner: "alice001", due: "1990-10-21" },
        { id: "ac000002", title: "Carl's task", owner: "carl0001", due: "1990-10-20" },
      ],
    });
    invoiceStore().replaceAll([owed]);
  });

  it("shows My work by default: court dates, actions and bills, each tagged and linked", () => {
    mount();
    expect(must("#home-work-title").textContent).toBe("My work: Alice Lawyer");
    expect(must("#home-scope-mine").getAttribute("aria-pressed")).toBe("true");
    const items = [...document.querySelectorAll("#home-work li")];
    expect(items.map((li) => li.querySelector("strong")!.textContent)).toEqual([
      "Invoice FA-1990-0001 · $300.00 owed",
      "Hearing",
      "Call the client",
    ]);
    expect(items.map((li) => li.querySelector(".home-kind")!.textContent)).toEqual(["Billing", "Court", "Action"]);
    expect(items[0].className).toBe("overdue");
    expect(items[0].textContent).toContain("Due Thu 1 Oct 1990, overdue, 18 days ago");
    expect(items[0].querySelector("a")!.getAttribute("href")).toBe("#ledger");
    expect(items[2].querySelector("a")!.getAttribute("href")).toBe("#cases/case0001");
  });

  it("switches to All firm work, which names who each action is for", () => {
    mount();
    act(() => must<HTMLButtonElement>("#home-scope-firm").click());
    expect(must("#home-work-title").textContent).toBe("All firm work");
    expect(must("#home-scope-firm").getAttribute("aria-pressed")).toBe("true");
    expect(texts("#home-work strong")).toContain("Carl's task");
    expect(must("#home-work").textContent).toContain("Carl Commissioner");
  });

  it("in All firm work, an action with no owner is Unassigned, and one whose owner isn't here is Unknown", () => {
    caseStore().save({
      ...caseStore().get("case0001")!,
      actions: [
        { id: "ac000003", title: "Nobody's", due: "1990-10-20" },
        { id: "ac000004", title: "Elsewhere", owner: "gone0001", due: "1990-10-20" },
      ],
    });
    mount();
    act(() => must<HTMLButtonElement>("#home-scope-firm").click());
    const row = (title: string) =>
      [...document.querySelectorAll("#home-work li")].find((li) => li.textContent!.includes(title))!.textContent;
    expect(row("Nobody's")).toContain("Unassigned");
    expect(row("Elsewhere")).toContain("Unknown character");
  });

  it("ticking an action off saves it and takes it off the list; a payment in full takes the bill off", () => {
    mount();
    act(() => must<HTMLInputElement>('[aria-label="Done: Call the client"]').click());
    expect(
      caseStore()
        .get("case0001")!
        .actions!.find((a) => a.id === "ac000001")!.done,
    ).toBe(true);
    expect(texts("#home-work strong")).not.toContain("Call the client");
    act(() => invoiceStore().addPayment("inv00001", { date: "1990-10-19", amount: 300 }));
    expect(texts("#home-work strong")).toEqual(["Hearing"]);
  });

  it("lists only the most urgent ten, and says how many there are", () => {
    caseStore().save({
      ...caseStore().get("case0001")!,
      actions: Array.from({ length: 12 }, (_, i) => ({
        id: "many" + String(i).padStart(4, "0"),
        title: "Task " + i,
        owner: "alice001",
        due: "1990-10-2" + (i % 9),
      })),
    });
    mount();
    expect(document.querySelectorAll("#home-work li")).toHaveLength(10);
    expect(must("#home-work-more").textContent).toBe("The 10 most urgent of 14.");
  });
});
