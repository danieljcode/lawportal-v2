// @vitest-environment jsdom
// Sticky notes (LP-55): one set of notes, a Notes panel on Modern's Home and
// draggable, resizable notes on the Classic desktop kept inside it; created,
// recoloured, linked to a case and deleted (after asking); synced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/shell/App";
import { caseStore } from "@/lib/cases";
import { cleanNote, MAX_NOTE_TEXT, MAX_NOTES, NOTE_SIZE, noteStore } from "@/lib/notes";
import { setShell } from "@/lib/shell";
import { resolve } from "@/lib/sync";
import * as sync from "@/lib/sync";
import { clampNote } from "@/ui/Notes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the notes store", () => {
  beforeEach(() => {
    localStorage.clear();
    noteStore().replaceAll([]);
  });

  it("cleans untrusted notes: colour, sizes and text as typed", () => {
    const n = cleanNote({ text: " Call DA \n", colour: "purple", w: 5, h: 9999, x: -40, caseId: "../x" })!;
    expect(n.text).toBe(" Call DA \n");
    expect(n.colour).toBe("yellow");
    expect([n.w, n.h, n.x]).toEqual([NOTE_SIZE.minW, NOTE_SIZE.maxH, 0]);
    expect(n).not.toHaveProperty("caseId");
    expect(cleanNote({ text: "x".repeat(900) })!.text).toHaveLength(MAX_NOTE_TEXT);
    expect(cleanNote("nope")).toBeNull();
  });

  it("adds, saves and removes, newest first, up to the cap", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00.000Z"));
    const a = noteStore().add()!;
    vi.setSystemTime(new Date("2026-11-13T10:01:00.000Z"));
    const b = noteStore().add("pink")!;
    expect(
      noteStore()
        .list()
        .map((n) => n.id),
    ).toEqual([b.id, a.id]);
    // Each new note sits a step down and right of the last.
    expect(b.x).toBeGreaterThan(a.x);
    noteStore().save({ ...a, text: "Call DA re: plea" });
    expect(noteStore().list()[1].text).toBe("Call DA re: plea");
    noteStore().remove(b.id);
    expect(
      noteStore()
        .list()
        .map((n) => n.id),
    ).toEqual([a.id]);
    for (let i = 1; i < MAX_NOTES; i++) noteStore().add();
    expect(noteStore().add()).toBeNull();
    vi.useRealTimers();
  });

  it("sync: another device's notes are taken", () => {
    const theirs = cleanNote({ id: "note0001", text: "From the phone", updated: "2026-11-13T00:00:00.000Z" })!;
    const { doc } = resolve({ characters: [], cases: [], notes: [theirs] }, null);
    expect(doc.notes).toMatchObject([{ id: "note0001", text: "From the phone" }]);
  });

  it("keeps a note inside the desktop", () => {
    const note = { x: 700, y: 500, w: 200, h: 150 };
    expect(clampNote(note, 800, 600)).toEqual({ x: 600, y: 450, w: 200, h: 150 });
    // A narrow desktop: the note shrinks to fit and sits at the left edge, but never below its smallest size.
    expect(clampNote(note, 150, 600)).toEqual({ x: 0, y: 450, w: 150, h: 150 });
    expect(clampNote(note, 100, 600)).toMatchObject({ x: 0, w: NOTE_SIZE.minW });
  });
});

/* ---------- in the app ---------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function must<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error("missing " + sel);
  return el;
}

function setValue(el: HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function mount(): Promise<void> {
  history.replaceState(null, "", "#");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(App)));
  // The notes UI loads after the rest of Home.
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

const click = (sel: string) => act(() => must(sel).click());

describe("notes in the app", () => {
  beforeEach(() => {
    localStorage.clear();
    noteStore().replaceAll([]);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(sync, "init").mockResolvedValue(undefined);
    caseStore().save({ id: "case0001", caseNumber: "90SCCC00147" });
  });

  afterEach(() => {
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("Modern: + New note, type, recolour, link a case, then delete after asking", async () => {
    await mount();
    expect(must("#notes-empty")).toBeTruthy();
    click("#new-note");
    setValue(must<HTMLTextAreaElement>("#notes-list .sticky-text"), "Call DA re: plea ");
    click('#notes-list [aria-label="Pink"]');
    setValue(must<HTMLSelectElement>("#notes-list .sticky-case"), "case0001");
    const [note] = noteStore().list();
    expect(note).toMatchObject({ text: "Call DA re: plea ", colour: "pink", caseId: "case0001" });
    expect(must("#notes-list .sticky-pink")).toBeTruthy();
    expect(must<HTMLAnchorElement>("#notes-list .sticky-link").getAttribute("href")).toBe("#cases/case0001");

    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    click("#notes-list .sticky-delete");
    expect(ask).toHaveBeenCalledOnce();
    expect(noteStore().list()).toHaveLength(1);
    ask.mockReturnValue(true);
    click("#notes-list .sticky-delete");
    expect(noteStore().list()).toHaveLength(0);
  });

  it("Classic: the same notes on the desktop, dragged and sized inside it, and moved by arrow keys", async () => {
    noteStore().add();
    noteStore().save({ ...noteStore().list()[0], text: "Made in Modern" });
    setShell("classic");
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    await mount();
    expect(must<HTMLTextAreaElement>("#desktop-notes .sticky-text").value).toBe("Made in Modern");

    const pointer = (el: Element, type: string, x: number, y: number) =>
      act(() => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
      });
    const grip = must("#desktop-notes .sticky-grip");
    pointer(grip, "pointerdown", 0, 0);
    pointer(grip, "pointermove", 2000, 100);
    pointer(grip, "pointerup", 2000, 100);
    // Dragged past the right edge: it stops at the edge.
    expect(noteStore().list()[0]).toMatchObject({ x: 800 - NOTE_SIZE.w, y: 116 });

    const corner = must("#desktop-notes .sticky-resize");
    pointer(corner, "pointerdown", 0, 0);
    pointer(corner, "pointermove", 1000, 1000);
    pointer(corner, "pointerup", 1000, 1000);
    expect(noteStore().list()[0]).toMatchObject({ w: NOTE_SIZE.maxW, h: NOTE_SIZE.maxH });

    act(() => {
      grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(noteStore().list()[0].y).toBe(100);

    click("#pm-new-note");
    expect(document.querySelectorAll("#desktop-notes .desktop-note")).toHaveLength(2);
  });
});
