// @vitest-environment jsdom
// New client intake (LP-19): building the case and its notes from an intake,
// and the program through the whole App: checks, Open case, the client sheet
// and printing it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { emptyIntake, intakeNotes, intakeProblem, intakeToCase, pendingNumber, type Intake } from "@/lib/intake";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const intake = (over: Partial<Intake> = {}): Intake => ({
  ...emptyIntake("alice001"),
  clientName: "Cy Ng",
  phone: "555-0101",
  address: "1 Grove St",
  source: "Referral",
  opposingParty: "Dee Long",
  summary: "Arrested for jaywalking.",
  urgency: "Urgent",
  ...over,
});

describe("building the case from an intake", () => {
  it("puts a criminal client on the defence, in the criminal court, open, led by the chosen character", () => {
    expect(intakeToCase(intake(), [], "1990-10-19", "Alice Lawyer")).toMatchObject({
      caseNumber: "PENDING-1",
      plaintiff: "Dee Long",
      defendant: "Cy Ng",
      court: "San Andreas Criminal Court",
      status: "Open",
      lead: "alice001",
      assigned: [],
    });
  });

  it("puts a civil client on the plaintiff's side, and keeps a case number given", () => {
    expect(
      intakeToCase(intake({ matter: "Civil", side: "plaintiff", caseNumber: " 90SCCC00042 " }), [], "1990-10-19"),
    ).toMatchObject({
      caseNumber: "90SCCC00042",
      plaintiff: "Cy Ng",
      defendant: "Dee Long",
      court: "San Andreas Civil Court",
    });
  });

  it("numbers stand-in cases so they don't clash", () => {
    expect(pendingNumber([{ caseNumber: "PENDING-1" }, { caseNumber: "pending-2" }])).toBe("PENDING-3");
  });

  it("writes the intake into the notes, with the in-game date", () => {
    expect(intakeNotes(intake(), "1990-10-19", "Alice Lawyer")).toBe(
      [
        "Client intake, Mon 19 Oct 1990",
        "Client: Cy Ng",
        "Phone: 555-0101",
        "Address: 1 Grove St",
        "Found the firm through: Referral",
        "Matter: Criminal",
        "Opposing party: Dee Long",
        "Urgency: Urgent",
        "Taken by: Alice Lawyer",
        "",
        "Arrested for jaywalking.",
      ].join("\n"),
    );
  });

  it("needs a client name and a summary", () => {
    expect(intakeProblem(intake({ clientName: " " }))).toBe("The client needs a name.");
    expect(intakeProblem(intake({ summary: "" }))).toBe("Add a short summary of the issue.");
    expect(intakeProblem(intake())).toBeNull();
  });
});

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
  act(() => {
    must(sel).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("the intake program (LP-19)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z"));
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    characterStore().save({ id: "alice001", name: "Alice Lawyer", title: "Attorney at Law" });
    characterStore().setActive("alice001");
    history.replaceState(null, "", "#intake");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));
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

  it("is reached from the sidebar and the Case File, and leads with the active character", () => {
    expect(must("#intake-title").textContent).toBe("New client intake");
    expect(location.hash).toBe("#clients/intake");
    expect(must("#clients-nav-intake").getAttribute("aria-current")).toBe("page");
    expect(must<HTMLSelectElement>("#intake-lead").value).toBe("alice001");
  });

  it("won't open a case without a client name and summary", () => {
    submit("#intake-form");
    expect(must("#intake-error").textContent).toBe("The client needs a name.");
    expect(caseStore().list()).toEqual([]);
  });

  it("the client sheet follows the form", () => {
    setValue("#intake-clientName", "Cy Ng");
    setValue("#intake-summary", "Arrested for jaywalking.");
    expect(must("#intake-sheet").textContent).toContain("Client: Cy Ng");
    expect(must("#intake-sheet").textContent).toContain("Client intake, Mon 19 Oct 1990");
    expect(must("#intake-sheet").textContent).toContain("Arrested for jaywalking.");
  });

  it("matter type sets the client's side; Open case makes the case and opens it", () => {
    setValue("#intake-clientName", "Cy Ng");
    setValue("#intake-matter", "Civil");
    expect(must<HTMLSelectElement>("#intake-side").value).toBe("plaintiff");
    setValue("#intake-opposingParty", "Dee Long");
    setValue("#intake-summary", "Unpaid invoice.");
    submit("#intake-form");
    const [c] = caseStore().list();
    expect(c).toMatchObject({
      caseNumber: "PENDING-1",
      plaintiff: "Cy Ng",
      defendant: "Dee Long",
      court: "San Andreas Civil Court",
      status: "Open",
      lead: "alice001",
    });
    expect(c.notes).toContain("Unpaid invoice.");
    expect(c.notes).toContain("Taken by: Alice Lawyer");
    expect(location.hash).toBe("#cases/" + c.id);
  });

  it("refuses a case number the firm already has", () => {
    caseStore().save({ caseNumber: "90SCCC00042", lead: "alice001" });
    setValue("#intake-clientName", "Cy Ng");
    setValue("#intake-summary", "Unpaid invoice.");
    setValue("#intake-caseNumber", "90sccc00042");
    submit("#intake-form");
    expect(must("#intake-error").textContent).toBe("90SCCC00042 is already a firm case.");
    expect(caseStore().list()).toHaveLength(1);
  });

  it("prints the client sheet", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    act(() => must("#intake-print").click());
    expect(print).toHaveBeenCalledTimes(1);
  });
});
