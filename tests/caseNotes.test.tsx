// @vitest-environment jsdom
// Case notes as dated entries (LP-227): the old notes box kept as the first note, notes from two
// copies of a case kept together, an old character file's notes, Find, and through the App:
// adding, editing and deleting a note.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { legacyNote, noteWhen, unionCaseNotes } from "@/lib/caseNotes";
import { caseStore, cleanCase, unifyCases } from "@/lib/cases";
import { characterStore } from "@/lib/characters";
import { docketStore } from "@/lib/dockets";
import { findIndex } from "@/lib/find";
import * as sync from "@/lib/sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CREATED = "2026-10-01T15:00:00.000Z";
const old = (over: Record<string, unknown> = {}) => ({
  id: "case0001",
  caseNumber: "90SCCR00147",
  status: "Open",
  lead: "alice001",
  assigned: [],
  created: CREATED,
  updated: "2026-10-05T15:00:00.000Z",
  notes: "Client called about bail.",
  ...over,
});

describe("the old notes box", () => {
  it("becomes the first note, dated when the case was created, by its lead", () => {
    const c = cleanCase(old());
    expect(c.caseNotes).toEqual([
      { id: expect.stringMatching(/^note[a-z0-9]+$/), text: "Client called about bail.", at: CREATED, by: "alice001" },
    ]);
    expect("notes" in c).toBe(false);
    // Cleaning again, or on another device, gives the same note, not a second one.
    expect(cleanCase(c).caseNotes).toEqual(c.caseNotes);
    expect(cleanCase(old()).caseNotes![0].id).toBe(c.caseNotes![0].id);
  });

  it("keeps notes added since alongside it, oldest first", () => {
    const added = { id: "note0001", text: "Hearing set.", at: "2026-10-03T12:00:00.000Z", by: "bob00001" };
    const c = cleanCase(old({ caseNotes: [added] }));
    expect(c.caseNotes!.map((n) => n.text)).toEqual(["Client called about bail.", "Hearing set."]);
  });

  it("leaves a case with no notes without any", () => {
    expect(cleanCase(old({ notes: "  " })).caseNotes).toBeUndefined();
  });

  it("from an old character file's docket comes in as a note", () => {
    localStorage.clear();
    docketStore().replace("alice001", [
      { caseNumber: "90SCCR00200", notes: "From the old file", status: "Open", updated: CREATED },
    ]);
    expect(caseStore().byNumber("90SCCR00200")!.caseNotes).toMatchObject([
      { text: "From the old file", at: CREATED, by: "alice001" },
    ]);
  });
});

describe("two copies of a case", () => {
  it("keep both copies' notes, each once", () => {
    const a = cleanCase(old({ caseNotes: [{ id: "note0001", text: "On A", at: "2026-10-02T00:00:00.000Z" }] }));
    const b = cleanCase(
      old({
        updated: "2026-10-06T00:00:00.000Z",
        caseNotes: [{ id: "note0002", text: "On B", at: "2026-10-03T00:00:00.000Z" }],
      }),
    );
    expect(unifyCases([a], [b])[0].caseNotes!.map((n) => n.text)).toEqual([
      "Client called about bail.",
      "On A",
      "On B",
    ]);
  });

  it("make the same note from the same old box", () => {
    const n = legacyNote("Same", CREATED, "alice001")!;
    expect(unionCaseNotes([n], [legacyNote("Same", CREATED, "bob00001")!])).toHaveLength(1);
  });
});

describe("finding notes", () => {
  it("Find searches every note on a case", () => {
    const c = cleanCase(old({ caseNotes: [{ id: "note0001", text: "Witness Zed Quill", at: CREATED }] }));
    const [item] = findIndex({ cases: [c], contacts: [], filings: [], invoices: [], time: [], nameOf: () => "" });
    expect(item.text).toContain("zed quill");
    expect(item.text).toContain("bail");
  });

  it("says when in game time", () => {
    expect(noteWhen("2026-10-19T16:00:00.000Z")).toBe("Mon 19 Oct 1990, 12:00");
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
  const el = must<HTMLTextAreaElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const submit = (sel: string) =>
  act(() => {
    must(sel)
      .closest("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
const click = (sel: string) => act(() => must(sel).click());
const notes = () => caseStore().get("case0001")!.caseNotes || [];

describe("notes on a case in the Case File", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T16:00:00Z")); // in-game Mon 19 Oct 1990, 12:00
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

  it("adds a dated note by the active character, edits it, and deletes it after asking", () => {
    history.replaceState(null, "", "#cases/case0001");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(App)));

    expect(must("#note-none")).toBeTruthy();
    expect(must<HTMLButtonElement>("#note-save").disabled).toBe(true);
    setValue("#note-text", "  Called the client.  ");
    submit("#note-save");
    expect(notes()).toMatchObject([{ text: "Called the client.", at: "2026-10-19T16:00:00.000Z", by: "alice001" }]);
    expect(must("#note-list .case-note-head").textContent).toBe("Mon 19 Oct 1990, 12:00 · Alice Lawyer");
    expect(must<HTMLTextAreaElement>("#note-text").value).toBe("");

    click('#note-list [aria-label="Edit note"]');
    setValue("#note-edit-text", "Called the client twice.");
    submit("#note-edit-save");
    expect(notes()).toMatchObject([{ text: "Called the client twice.", at: "2026-10-19T16:00:00.000Z" }]);

    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    click('#note-list [aria-label="Delete note"]');
    expect(ask).toHaveBeenCalled();
    expect(notes()).toHaveLength(1);
    ask.mockReturnValue(true);
    click('#note-list [aria-label="Delete note"]');
    expect(notes()).toEqual([]);
    expect(must("#note-none")).toBeTruthy();
  });
});
