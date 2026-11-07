// @vitest-environment jsdom
// Copy brief (LP-228): where a case stands as one Discord message, typed text escaped, dates in game
// time, cut to fit 2,000 characters, and billing only when asked for.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { BRIEF_LIMIT, caseBrief } from "@/lib/caseBrief";
import { caseStore, cleanCase } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { timeStore } from "@/lib/ledger";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const names: Record<string, string> = { alice001: "Alice Lawyer", bob00001: "Bob Partner" };
const opts = { nameOf: (id: string | null | undefined) => (id && names[id]) || "", today: "1990-10-19" };
const c = cleanCase({
  id: "case0001",
  caseNumber: "90SCCR00147",
  plaintiff: "State of San Andreas",
  defendant: "John *Doe*",
  court: "San Andreas Court",
  status: "Open",
  lead: "alice001",
  assigned: ["bob00001"],
  deadlines: [
    { id: "dead0001", date: "1990-11-03", label: "Arraignment" },
    { id: "dead0002", date: "1990-10-10", label: "Old, dealt with", done: true },
  ],
  actions: [
    { id: "act00001", title: "Call the client", owner: "alice001", due: "1990-10-22" },
    { id: "act00002", title: "Ping @everyone", done: false },
    { id: "act00003", title: "Done already", done: true },
  ],
});

describe("caseBrief", () => {
  it("says where the case stands, escaped, with no billing unless asked", () => {
    expect(caseBrief(c, opts)).toBe(
      [
        "**90SCCR00147** · State of San Andreas v. John \\*Doe\\*",
        "Status: Open · Lead: Alice Lawyer (with Bob Partner)",
        "Court: San Andreas Court",
        "Next date: Tue 3 Nov 1990, Arraignment",
        "Next actions:",
        "- Call the client (Alice Lawyer, due Thu 22 Oct 1990)",
        "- Ping @​everyone",
      ].join("\n"),
    );
  });

  it("marks an overdue court date, and says none when there's nothing", () => {
    expect(caseBrief(c, { ...opts, today: "1990-11-05" })).toContain(
      "Next date: Tue 3 Nov 1990, Arraignment (overdue)",
    );
    const bare = cleanCase({ id: "case0002", caseNumber: "90SCCR00148", lead: null });
    expect(caseBrief(bare, opts)).toBe(
      ["**90SCCR00148**", "Status: Open · Lead: none", "Next date: none", "Next actions: none"].join("\n"),
    );
  });

  it("adds billing only when given it", () => {
    const text = caseBrief(c, { ...opts, billing: { loggedHours: 2.5, invoiced: 250, paid: 100, outstanding: 150 } });
    expect(text.split("\n").pop()).toBe("Billing: 2.5 hours logged · $250.00 invoiced, $100.00 paid, $150.00 owed");
  });

  it("fits one Discord message, cutting the actions to '…and n more'", () => {
    const many = cleanCase({
      ...c,
      actions: Array.from({ length: 100 }, (_, i) => ({
        id: "act" + String(i).padStart(5, "0"),
        title: "x".repeat(110) + i,
      })),
    });
    const text = caseBrief(many, opts);
    expect(text.length).toBeLessThanOrEqual(BRIEF_LIMIT);
    const more = /- …and (\d+) more$/.exec(text);
    expect(more).not.toBeNull();
    const shown = text.split("\n").filter((l) => l.startsWith("- x")).length;
    expect(shown + Number(more![1])).toBe(100);
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

describe("Copy brief on a case", () => {
  const writeText = vi.fn<(t: string) => Promise<void>>();

  beforeEach(() => {
    localStorage.clear();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z"));
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", rate: "100" });
    characterStore().save({ id: "bob00001", name: "Bob Partner" });
    characterStore().setActive("alice001");
    caseStore().save(c);
    timeStore().save({ caseId: "case0001", character: "alice001", date: "1990-10-18", hours: 2, activity: "court" });
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

  it("copies the brief, with billing only when ticked", async () => {
    history.replaceState(null, "", "#cases/case0001");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    await act(async () => must("#case-brief-copy").click());
    expect(writeText).toHaveBeenLastCalledWith(caseBrief(caseStore().get("case0001")!, opts));
    expect(writeText.mock.lastCall![0]).not.toContain("Billing");
    expect(must("#case-brief-status").textContent).toBe("Copied. Paste it in Discord.");

    act(() => must<HTMLInputElement>("#case-brief-billing").click());
    await act(async () => must("#case-brief-copy").click());
    expect(writeText.mock.lastCall![0]).toContain("Billing: 2.0 hours logged");
  });
});
