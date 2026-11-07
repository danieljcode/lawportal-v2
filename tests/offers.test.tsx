// @vitest-environment jsdom
// Plea and settlement offers (LP-229): cleaned, newest first, kept from both copies of a case, and in
// the Case File: added, countered with a link to the counter-offer, and accepted, which suggests
// closing the case with the matching outcome without doing it by itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore, cleanCase, unifyCases } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { cleanOffer, cleanOffers, offerOutcome } from "@/lib/offers";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("offers", () => {
  it("are cleaned: defaults for unknown values, and a counter-offer only when countered", () => {
    expect(
      cleanOffer({ id: "off00001", date: "1990-10-01", terms: "  Six months  ", from: "x", response: "y" }),
    ).toEqual({ id: "off00001", date: "1990-10-01", from: "prosecution", terms: "Six months", response: "pending" });
    expect(cleanOffer({ date: "1990-10-01", terms: "" })).toBeNull();
    expect(cleanOffer({ date: "soon", terms: "x" })).toBeNull();
    const base = { id: "off00001", date: "1990-10-01", terms: "x", counter: "off00002" };
    expect(cleanOffer({ ...base, response: "rejected" })).not.toHaveProperty("counter");
    expect(cleanOffer({ ...base, response: "countered" })!.counter).toBe("off00002");
    expect(cleanOffer({ ...base, response: "countered", counter: "off00001" })).not.toHaveProperty("counter");
  });

  it("are newest first, and both copies of a case keep theirs, the newer copy winning", () => {
    expect(
      cleanOffers([
        { id: "off00001", date: "1990-10-01", terms: "a" },
        { id: "off00002", date: "1990-10-05", terms: "b" },
      ]).map((o) => o.id),
    ).toEqual(["off00002", "off00001"]);

    const older = cleanCase({
      id: "case0001",
      caseNumber: "90SCCR00147",
      updated: "2026-10-01T00:00:00.000Z",
      offers: [
        { id: "off00001", date: "1990-10-01", terms: "a" },
        { id: "off00003", date: "1990-10-02", terms: "only here" },
      ],
    });
    const newer = cleanCase({
      ...older,
      updated: "2026-10-05T00:00:00.000Z",
      offers: [{ id: "off00001", date: "1990-10-01", terms: "a", response: "accepted" }],
    });
    expect(unifyCases([newer], [older])[0].offers).toMatchObject([
      { id: "off00003" },
      { id: "off00001", response: "accepted" },
    ]);
  });

  it("suggest a plea deal in a criminal case, else a settlement", () => {
    expect(offerOutcome({ from: "prosecution" })).toBe("plea");
    expect(offerOutcome({ from: "defence" })).toBe("plea");
    expect(offerOutcome({ from: "plaintiff" })).toBe("settled");
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

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const addOffer = (from: string, terms: string) => {
  setValue(must<HTMLSelectElement>("#offer-from"), from);
  setValue(must<HTMLInputElement>("#offer-terms"), terms);
  act(() => {
    must("#offer-add").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};
const offers = () => caseStore().get("case0001")!.offers || [];
const responseOf = (i: number) => must<HTMLSelectElement>(`#offer-list > li:nth-child(${i}) select`);

describe("the Offers section", () => {
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

  it("logs offers, links a counter-offer, and only closes the case when asked", () => {
    history.replaceState(null, "", "#cases/case0001");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    expect(must("#offer-none")).toBeTruthy();
    addOffer("prosecution", "");
    expect(must("#offer-error").textContent).toContain("Write the terms");
    addOffer("prosecution", "Plead to one count, 6 months.");
    vi.setSystemTime(new Date("2026-10-19T16:01:00Z"));
    addOffer("defence", "Plead to one count, 3 months.");
    expect(offers()).toMatchObject([
      { from: "defence", date: "1990-10-19", response: "pending" },
      { from: "prosecution", date: "1990-10-19", response: "pending" },
    ]);
    const [second, first] = offers();

    // The prosecution's offer is countered by the defence's.
    const firstRow = () => must(`#offer-${first.id}`);
    setValue(firstRow().querySelector("select")!, "countered");
    setValue(firstRow().querySelectorAll("select")[1], second.id);
    expect(
      caseStore()
        .get("case0001")!
        .offers!.find((o) => o.id === first.id),
    ).toMatchObject({
      response: "countered",
      counter: second.id,
    });
    act(() => [...firstRow().querySelectorAll("button")].find((b) => b.textContent === "Go to counter-offer")!.click());
    expect(document.activeElement).toBe(must(`#offer-${second.id}`));

    // Accepting suggests closing; Not now leaves the case open.
    setValue(must(`#offer-${second.id}`).querySelector("select")!, "accepted");
    expect(must("#offer-suggest").textContent).toContain("Close the case as plea deal?");
    act(() => must("#offer-not-now").click());
    expect(document.querySelector("#offer-suggest")).toBeNull();
    expect(caseStore().get("case0001")!.status).toBe("Open");

    setValue(must(`#offer-${second.id}`).querySelector("select")!, "pending");
    setValue(must(`#offer-${second.id}`).querySelector("select")!, "accepted");
    act(() => must("#offer-close-case").click());
    expect(caseStore().get("case0001")).toMatchObject({
      status: "Closed",
      outcome: { result: "plea", date: "1990-10-19", note: "Plead to one count, 3 months." },
    });
    expect(responseOf(1)).toBeTruthy();
  });
});
